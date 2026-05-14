import sqlite3

conn = sqlite3.connect('history.db')
conn.row_factory = sqlite3.Row

print("=== 完整数据对应关系 ===\n")

exhibits = conn.execute("SELECT id, name, code, default_language, exhibit_video_filename FROM exhibits").fetchall()
contents = conn.execute("SELECT id, exhibit_id, title, body, language, status, video_filename FROM contents").fetchall()

print(f"共有 {len(exhibits)} 个展品, {len(contents)} 条内容\n")

for ex in exhibits:
    print(f"┌─ 展品: [{ex['code']}] {ex['name']} (lang={ex['default_language']})")
    if ex['exhibit_video_filename']:
        print(f"│   展品视频: {ex['exhibit_video_filename']}")

    matched = [c for c in contents if c['exhibit_id'] == ex['id']]
    if matched:
        for c in matched:
            print(f"│   内容: lang={c['language']} status={c['status']} video={c['video_filename']}")
            print(f"│   标题: {c['title']}")
            print(f"│   正文: {c['body'][:60]}...")
    else:
        print(f"│   (无内容)")
    print()
