# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

exhibits = {str(e['id']): dict(e) for e in conn.execute("SELECT id, name, code FROM exhibits").fetchall()}
contents = list(conn.execute("SELECT id, exhibit_id, title, language FROM contents ORDER BY created_at").fetchall())

CORRECT = {
    'b29746effe3148f6812c149ca10296ae': '兵马俑 demo',
    'a6100e9e6f8c4d2eac2edd4a53cd9f79': '杜甫草堂',
    'cd0977b12784433ea39b6db0d083abae': '圆明园遗址',
}

fixes = []
for c in contents:
    title = c['title']
    correct_eid = None
    if '少儿' in title or '兵马俑' in title:
        correct_eid = 'b29746effe3148f6812c149ca10296ae'
    elif '三彩' in title or '唐代' in title:
        correct_eid = 'a6100e9e6f8c4d2eac2edd4a53cd9f79'
    elif '飞天' in title or '敦煌' in title:
        correct_eid = 'cd0977b12784433ea39b6db0d083abae'
    else:
        continue

    eid = str(c['exhibit_id'])
    if eid != correct_eid:
        old_name = exhibits.get(eid, {}).get('name', '???')
        new_name = CORRECT.get(correct_eid, '???')
        fixes.append((c['id'], correct_eid, title, old_name, new_name))

if fixes:
    print(f"修正 {len(fixes)} 条:")
    for cid, new_eid, title, old_name, new_name in fixes:
        print(f"  [{title}]: {old_name} -> {new_name}")
    for cid, new_eid, _, _, _ in fixes:
        conn.execute("UPDATE contents SET exhibit_id = ? WHERE id = ?", (new_eid, cid))
    conn.commit()
    print("已修正!\n")

# Re-fetch to verify
print("=== 最终对应关系 ===")
contents2 = list(conn.execute("SELECT id, exhibit_id, title FROM contents ORDER BY created_at").fetchall())
for c in contents2:
    eid = str(c['exhibit_id'])
    ex = exhibits.get(eid, {})
    ex_name = ex.get('name', '???') if eid else '(空)'
    print(f"  [{c['title']}] -> {ex_name}")
