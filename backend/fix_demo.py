import sqlite3

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

# Get all exhibits and find the correct mapping
exhibits = {e['id']: e for e in conn.execute("SELECT * FROM exhibits").fetchall()}
contents = conn.execute("SELECT * FROM contents").fetchall()

# Based on content title, determine correct exhibit_id
# The demo bug: i % 3 cycle was wrong because of existing pre-demo content

# First, figure out which exhibit is 青铜鼎, 唐代三彩马, 敦煌飞天
# We know DEMO001=青铜鼎, DEMO002=唐代三彩马, DEMO003=敦煌飞天 from the demo code
# But those are already in DB. Let me find them by their correct content titles.
correct_map = {}
for c in contents:
    title = c['title']
    eid = c['exhibit_id']
    if '兵马俑' in title and '介绍' in title:
        correct_map['兵马俑'] = eid
    elif '兵马俑' in title and '少儿' in title:
        correct_map['少儿'] = eid
    elif '杜甫' in title and '介绍' in title:
        correct_map['杜甫'] = eid

print("正确映射:")
for k, v in correct_map.items():
    print(f"  {k} -> {v}")

# Build exhibit_id -> name map
exhibit_names = {e['id']: e['name'] for e in exhibits.values()}
print("\n展品ID -> 名称:")
for eid, name in exhibit_names.items():
    print(f"  {eid} -> {name}")

print("\n内容 -> 当前exhibit_id -> 正确的exhibit_id:")
fixes = {}

# 根据标题判断正确归属
# 兵马俑·介绍 应该属于兵马俑 demo (b29746ef) - 当前已经对 ✓
# 兵马俑·少儿版 应该属于兵马俑 demo (b29746ef) - 当前在杜甫草堂 ✗
# 杜甫草堂·介绍 应该属于杜甫草堂 (a6100e9e) - 当前在圆明园遗址 ✗
# 圆明园遗址·介绍 应该属于圆明园遗址 (cd0977b1) - 当前在兵马俑 demo ✗

for c in contents:
    title = c['title']
    current_eid = c['exhibit_id']

    if '兵马俑' in title and '介绍' in title:
        correct_eid = 'b29746ef'  # 兵马俑 demo
    elif '兵马俑' in title and '少儿' in title:
        correct_eid = 'b29746ef'  # 兵马俑 demo
    elif '杜甫' in title:
        correct_eid = 'a6100e9e'  # 杜甫草堂
    elif '圆明园' in title:
        correct_eid = 'cd0977b1'  # 圆明园遗址
    else:
        continue

    if current_eid != correct_eid:
        fixes[c['id']] = (current_eid, correct_eid)
        print(f"  [{title}] 当前: {current_eid[:8]} ({exhibit_names.get(current_eid,'?')}) -> 应改为: {correct_eid[:8]} ({exhibit_names.get(correct_eid,'?')})")
    else:
        print(f"  [{title}] 当前正确 ✓")

print(f"\n共 {len(fixes)} 条需要修正")

if fixes:
    for cid, (old_eid, new_eid) in fixes.items():
        conn.execute("UPDATE contents SET exhibit_id = ? WHERE id = ?", (new_eid, cid))
    conn.commit()
    print("已修正!")
