# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

contents = conn.execute("SELECT id, exhibit_id, title FROM contents").fetchall()
exhibits = {e['id']: e for e in conn.execute("SELECT id, name, code FROM exhibits").fetchall()}

print("=== 内容 -> 归属展品 ===")
for c in contents:
    ex = exhibits.get(c['exhibit_id'])
    print(f"内容: {c['title']}")
    print(f"  当前归属: {ex['name'] if ex else '???'} ({c['exhibit_id'][:8]})")
    print()
