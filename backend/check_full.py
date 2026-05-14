# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

exhibits = {e['id']: e for e in conn.execute("SELECT id, name, code FROM exhibits").fetchall()}
contents = conn.execute("SELECT id, exhibit_id, title, language FROM contents").fetchall()

print("展品:")
for eid, e in exhibits.items():
    print(f"  {eid} = {e['name']} ({e['code']})")

print()
for c in contents:
    ex = exhibits.get(c['exhibit_id'])
    print(f"内容: {c['title']} (lang={c['language']})")
    print(f"  -> exhibit_id = {c['exhibit_id']}")
    print(f"  -> exhibit名 = {ex['name'] if ex else '???'}")
    print()
