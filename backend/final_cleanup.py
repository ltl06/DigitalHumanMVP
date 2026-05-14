# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')

# 删除 exhibit_id 为空的内容
r = conn.execute("DELETE FROM contents WHERE exhibit_id = '' OR exhibit_id IS NULL").rowcount
conn.commit()
print(f"已删除 {r} 条孤立内容")

# 最终验证
print()
print("=== 最终数据 ===")
print("展品:")
for e in conn.execute("SELECT id, name, code, default_language, exhibit_video_filename FROM exhibits").fetchall():
    print(f"  [{e[2]}] {e[1]} | lang={e[3]} | video={e[4]}")
print()
print("内容:")
for c in conn.execute("SELECT exhibit_id, title, language, status FROM contents").fetchall():
    print(f"  {c[0][:8]}... | {c[1]} | lang={c[2]} | status={c[3]}")
