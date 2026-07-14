@echo off
title CaseMoney Frontend
cd /d "%~dp0frontend"
call npm run dev -- --host
pause
