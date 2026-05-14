# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

# 直接查当前状态，不缓存
print("=== 当前数据库完整状态 ===\n")

print("展品:")
for e in conn.execute("SELECT id, name, code, default_language, exhibit_video_filename FROM exhibits").fetchall():
    print(f"  {e['id']} | name={e['name']} | code={e['code']} | lang={e['default_language']} | video={e['exhibit_video_filename']}")

print()
print("内容:")
for c in conn.execute("SELECT id, exhibit_id, title, language, status, video_filename FROM contents").fetchall():
    print(f"  exhibit_id={c['exhibit_id']} | title={c['title']} | lang={c['language']} | status={c['status']}")
