# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

exhibits = {e['id']: e for e in conn.execute("SELECT id, name, code FROM exhibits").fetchall()}
contents = conn.execute("SELECT id, exhibit_id, title FROM contents").fetchall()

print("=== 修正前 ===")
for c in contents:
    ex = exhibits.get(c['exhibit_id'])
    print(f"  {c['title']} -> {ex['name'] if ex else '???'} ({c['exhibit_id'][:8]})")

# 根据标题判断正确归属并修正
# 标题包含"兵马俑" -> 兵马俑 demo (b29746effe3148f6812c149ca10296ae)
# 标题包含"杜甫" -> 杜甫草堂 (a6100e9e6f8c4d2eac2edd4a53cd9f79)
# 标题包含"圆明园" -> 圆明园遗址 (cd0977b12784433ea39b6db0d083abae)
fixes = []
for c in contents:
    title = c['title']
    correct_eid = None
    if '兵马俑' in title:
        correct_eid = 'b29746effe3148f6812c149ca10296ae'
    elif '杜甫' in title:
        correct_eid = 'a6100e9e6f8c4d2eac2edd4a53cd9f79'
    elif '圆明园' in title:
        correct_eid = 'cd0977b12784433ea39b6db0d083abae'
    else:
        continue

    if c['exhibit_id'] != correct_eid:
        fixes.append((c['id'], c['exhibit_id'], correct_eid, title))

print(f"\n=== 需要修正 {len(fixes)} 条 ===")
for cid, old, new, title in fixes:
    old_name = exhibits.get(old, {}).get('name', '???')
    new_name = exhibits.get(new, {}).get('name', '???')
    print(f"  [{title}]")
    print(f"    {old_name} -> {new_name}")

for cid, old, new, title in fixes:
    conn.execute("UPDATE contents SET exhibit_id = ? WHERE id = ?", (new, cid))

conn.commit()
print(f"\n已修正 {len(fixes)} 条内容归属!")

# 验证
print("\n=== 修正后 ===")
contents2 = conn.execute("SELECT id, exhibit_id, title FROM contents").fetchall()
for c in contents2:
    ex = exhibits.get(c['exhibit_id'])
    print(f"  {c['title']} -> {ex['name'] if ex else '???'} ({c['exhibit_id'][:8]})")
