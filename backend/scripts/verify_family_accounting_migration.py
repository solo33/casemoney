import os, sys, uuid
from pathlib import Path
import psycopg2
from psycopg2 import sql
from dotenv import dotenv_values
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from alembic.config import Config
from alembic import command
root=Path(__file__).resolve().parents[1]
url=make_url(dotenv_values(root/'.env')['DATABASE_URL'])
assert url.host in ('localhost','127.0.0.1'), 'Only isolated local PostgreSQL is permitted'
name='casemoney_refactor_'+uuid.uuid4().hex[:12]
admin=psycopg2.connect(url.set(database='postgres').render_as_string(hide_password=False));admin.autocommit=True
engine=None
try:
 with admin.cursor() as cur:cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
 test_url=url.set(database=name).render_as_string(hide_password=False)
 os.environ['DATABASE_URL']=test_url
 sys.path.insert(0,str(root))
 cfg=Config(str(root/'alembic.ini'));cfg.set_main_option('script_location',str(root/'alembic'))
 command.upgrade(cfg,'ff1a2b3c4d5e')
 import app.main
 from app.models.user import User
 from app.models.account import Account
 from app.models.transaction import Transaction,TransactionType
 from app.models.family import Family,FamilyMember,FamilyExpenseAccounting
 engine=create_engine(test_url)
 with Session(engine) as db:
  owner=User(email='owner@example.test',username='owner',hashed_password='unused');member=User(email='member@example.test',username='member',hashed_password='unused');db.add_all([owner,member]);db.flush()
  family=Family(name='Migration test',owner_user_id=owner.id);db.add(family);db.flush()
  for u in (owner,member):
   db.add(FamilyMember(family_id=family.id,user_id=u.id,email=u.email,status='active',role='owner' if u==owner else 'member',invited_by_user_id=owner.id))
   account=Account(name='test',user_id=u.id);db.add(account);db.flush()
   db.add(Transaction(user_id=u.id,account_id=account.id,type=TransactionType.expense,amount=123.45,currency='RUB',is_family_expense=True))
  db.commit()
 command.upgrade(cfg,'head')
 with Session(engine) as db:
  rows=db.query(FamilyExpenseAccounting).all();assert len(rows)==2
  assert sorted(r.status for r in rows)==['accepted','pending']
  assert all(t.family_id is not None for t in db.query(Transaction).all())
  before=[(t.id,t.amount) for t in db.query(Transaction).order_by(Transaction.id)]
 command.downgrade(cfg,'ff1a2b3c4d5e');command.upgrade(cfg,'head')
 with Session(engine) as db:
  assert db.query(FamilyExpenseAccounting).count()==2
  assert before==[(t.id,t.amount) for t in db.query(Transaction).order_by(Transaction.id)]
 print('PASS: PostgreSQL legacy repair, idempotence, downgrade/upgrade, unchanged amounts', flush=True)
 if '--suite' in sys.argv:
  import subprocess
  env={**os.environ, 'TEST_DATABASE_URL':test_url, 'RATELIMIT_ENABLED':'0'}
  result=subprocess.run([sys.executable,'-m','pytest','-x','-p','no:cacheprovider'],cwd=root,env=env)
  assert result.returncode==0, 'PostgreSQL test suite failed'
finally:
 if engine is not None:engine.dispose()
 with admin.cursor() as cur:
  cur.execute('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid<>pg_backend_pid()',(name,))
  cur.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
 admin.close()
