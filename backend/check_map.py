import sqlite3

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

exhibits = conn.execute("SELECT id, name, code, default_language FROM exhibits").fetchall()
contents = conn.execute("SELECT id, exhibit_id, title, language, status FROM contents").fetchall()

exhibit_map = {e['id']: e for e in exhibits}

header = "展品ID | 展品名 | lang | -> 内容ID | 内容标题 | 内容lang | 状态 | 匹配"
print(header)
print("-" * 120)

for c in contents:
    ex = exhibit_map.get(c['exhibit_id'])
    ex_name = ex['name'] if ex else "??? 找不到!"
    ex_lang = ex['default_language'] if ex else "???"
    match = "OK" if ex else "错乱!"
    print(f"{c['exhibit_id'][:8]}... | {ex_name[:18]} | {ex_lang} | {c['id'][:8]}... | {c['title'][:28]} | {c['language']} | {c['status']} | {match}")
