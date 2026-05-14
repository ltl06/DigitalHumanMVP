# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')

# 要删除的展品 code
delete_codes = ['BH001', 'TEST01', 'BH01', '321312']

# 先查一下这些展品关联了哪些内容
print("=== 将被删除的展品 ===")
for code in delete_codes:
    ex = conn.execute("SELECT id, name, code FROM exhibits WHERE code = ?", (code,)).fetchone()
    if ex:
        contents = conn.execute("SELECT id, title FROM contents WHERE exhibit_id = ?", (ex[0],)).fetchall()
        print(f"  [{ex[2]}] {ex[1]} (id={ex[0]})")
        for c in contents:
            print(f"    内容: {c[1]}")

print()

# 删除这些展品（关联的内容也会被级联删除，或手动删除）
for code in delete_codes:
    ex = conn.execute("SELECT id FROM exhibits WHERE code = ?", (code,)).fetchone()
    if ex:
        cid = ex[0]
        conn.execute("DELETE FROM contents WHERE exhibit_id = ?", (cid,))
        conn.execute("DELETE FROM exhibits WHERE id = ?", (cid,))
        print(f"已删除展品 {code} 及其内容")

conn.commit()
print()

# 验证剩余数据
print("=== 清理后的展品 ===")
for e in conn.execute("SELECT id, name, code, default_language, exhibit_video_filename FROM exhibits").fetchall():
    print(f"  [{e[2]}] {e[1]} | lang={e[3]} | video={e[4]}")

print()
print("=== 清理后的内容 ===")
for c in conn.execute("SELECT id, exhibit_id, title, language, status FROM contents").fetchall():
    print(f"  exhibit={c[1][:8]}... | {c[2]} | lang={c[3]} | status={c[4]}")
