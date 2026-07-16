[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$DumpPath = (Join-Path $PSScriptRoot "migration-artifacts/casemoney.dump"),
    [switch]$ResetTarget,
    [switch]$AllowOlderTarget,
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetDatabase
)

$ErrorActionPreference = "Stop"

function Get-RequiredCommand {
    param([Parameter(Mandatory = $true)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name was not found. Install PostgreSQL client tools 18 and try again."
    }
    return $command.Source
}

function Invoke-PsqlScalar {
    param(
        [Parameter(Mandatory = $true)][string]$Psql,
        [Parameter(Mandatory = $true)][string]$DatabaseUrl,
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $output = & $Psql --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --dbname $DatabaseUrl --command $Sql
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed with exit code $LASTEXITCODE."
    }
    return (($output | ForEach-Object { $_.ToString().Trim() }) -join "`n").Trim()
}

function Quote-Identifier {
    param([Parameter(Mandatory = $true)][string]$Value)
    return '"' + $Value.Replace('"', '""') + '"'
}

$sourceUrl = $env:CASEMONEY_SOURCE_DATABASE_URL
$targetUrl = $env:CASEMONEY_TARGET_DATABASE_URL

if ([string]::IsNullOrWhiteSpace($sourceUrl)) {
    $sourceSecret = Read-Host "Paste the full external Neon database URL" -AsSecureString
    $sourceUrl = [System.Net.NetworkCredential]::new("", $sourceSecret).Password
}
if ([string]::IsNullOrWhiteSpace($targetUrl)) {
    if ([string]::IsNullOrWhiteSpace($TargetHost) -or
        [string]::IsNullOrWhiteSpace($TargetUser) -or
        [string]::IsNullOrWhiteSpace($TargetDatabase)) {
        throw "Set CASEMONEY_TARGET_DATABASE_URL or provide TargetHost, TargetUser, and TargetDatabase."
    }
    $targetSecret = Read-Host "Enter the Amvera database password" -AsSecureString
    $targetPassword = [System.Net.NetworkCredential]::new("", $targetSecret).Password
    $encodedTargetPassword = [Uri]::EscapeDataString($targetPassword)
    $targetUrl = "postgresql://${TargetUser}:$encodedTargetPassword@${TargetHost}:5432/${TargetDatabase}?sslmode=require"
}
if ($sourceUrl -eq $targetUrl) {
    throw "Source and target database URLs are identical. Migration stopped."
}

$pgDump = Get-RequiredCommand "pg_dump"
$pgRestore = Get-RequiredCommand "pg_restore"
$psql = Get-RequiredCommand "psql"

Write-Host "Checking database connections and PostgreSQL versions..."
$sourceVersionNumber = [int](Invoke-PsqlScalar $psql $sourceUrl "SHOW server_version_num;")
$targetVersionNumber = [int](Invoke-PsqlScalar $psql $targetUrl "SHOW server_version_num;")
$sourceMajor = [math]::Floor($sourceVersionNumber / 10000)
$targetMajor = [math]::Floor($targetVersionNumber / 10000)

if ($targetMajor -lt $sourceMajor -and -not $AllowOlderTarget) {
    throw "Target PostgreSQL $targetMajor is older than source PostgreSQL $sourceMajor. Retry with -AllowOlderTarget only after reviewing compatibility."
}
if ($targetMajor -lt ($sourceMajor - 1)) {
    throw "Cross-version restore is limited to one PostgreSQL major version. Source=$sourceMajor, target=$targetMajor."
}
if ($targetMajor -lt $sourceMajor) {
    Write-Warning "Testing a logical restore from PostgreSQL $sourceMajor to $targetMajor. The source is untouched and the restore is transactional."
}

$targetTableCount = [int](Invoke-PsqlScalar $psql $targetUrl @"
SELECT count(*)
FROM pg_catalog.pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
"@)

if ($targetTableCount -gt 0 -and -not $ResetTarget) {
    throw "The target already contains $targetTableCount tables. For a new test database, retry with -ResetTarget. Never reset a production database."
}

$dumpDirectory = Split-Path -Parent $DumpPath
if (-not (Test-Path $dumpDirectory)) {
    New-Item -ItemType Directory -Path $dumpDirectory -Force | Out-Null
}

Write-Host "Creating a local backup of the source database..."
& $pgDump --format=custom --no-owner --no-acl --dbname $sourceUrl --file $DumpPath
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE. The target database was not changed."
}

& $pgRestore --list $DumpPath | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "The dump did not pass validation. The target database was not changed."
}

if ($targetTableCount -gt 0) {
    if (-not $PSCmdlet.ShouldProcess("new Amvera database", "drop the public schema before restore")) {
        Write-Host "Operation cancelled. Backup retained at: $DumpPath"
        return
    }
    Write-Host "Resetting the public schema in the target Amvera database only..."
    Invoke-PsqlScalar $psql $targetUrl "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" | Out-Null
}

Write-Host "Restoring the backup into Amvera..."
& $pgRestore --exit-on-error --single-transaction --no-owner --no-acl --dbname $targetUrl $DumpPath
if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed with exit code $LASTEXITCODE. Do not switch the application to Amvera."
}

Write-Host "Comparing tables and exact row counts..."
$tableRows = Invoke-PsqlScalar $psql $sourceUrl @"
SELECT schemaname || '|' || tablename
FROM pg_catalog.pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename;
"@
$tables = @($tableRows -split "`n" | Where-Object { $_ })
$differences = @()
$counts = [ordered]@{}

foreach ($table in $tables) {
    $parts = $table.Split('|', 2)
    if ($parts.Count -ne 2) {
        throw "Could not parse table name: $table"
    }
    $qualifiedName = "$(Quote-Identifier $parts[0]).$(Quote-Identifier $parts[1])"
    $sourceCount = [long](Invoke-PsqlScalar $psql $sourceUrl "SELECT count(*) FROM $qualifiedName;")
    $targetCount = [long](Invoke-PsqlScalar $psql $targetUrl "SELECT count(*) FROM $qualifiedName;")
    $counts[$table] = [ordered]@{ source = $sourceCount; target = $targetCount }
    if ($sourceCount -ne $targetCount) {
        $differences += "$table`: Neon=$sourceCount, Amvera=$targetCount"
    }
}

$reportPath = [IO.Path]::ChangeExtension($DumpPath, ".verification.json")
[ordered]@{
    created_at = (Get-Date).ToString("o")
    source_postgresql_major = $sourceMajor
    target_postgresql_major = $targetMajor
    tables = $counts
} | ConvertTo-Json -Depth 5 | Set-Content -Path $reportPath -Encoding utf8

if ($differences.Count -gt 0) {
    throw "Row counts differ:`n$($differences -join "`n")`nDo not switch the application to Amvera."
}

Write-Host "Success: all $($tables.Count) tables and row counts match." -ForegroundColor Green
Write-Host "Backup: $DumpPath"
Write-Host "Verification report: $reportPath"
Write-Host "You can now configure the internal Amvera DATABASE_URL and run alembic upgrade head."
