from pathlib import Path

root=Path('reseller')
gradle=root/'build.gradle'
s=gradle.read_text()
assert "versionCode 82" in s and "versionName '2.5.2'" in s
s=s.replace('versionCode 82','versionCode 84',1).replace("versionName '2.5.2'","versionName '2.6.0'",1)
gradle.write_text(s)

index=root/'src/main/assets/reseller/index.html'
s=index.read_text()
tag='<script src="v260-facebook-public.js"></script>'
assert 'v200-app.js' in s and '</body>' in s
if tag not in s:s=s.replace('</body>',tag+'\n</body>',1)
index.write_text(s)

v260=root/'src/main/assets/reseller/v260-facebook-public.js'
assert v260.exists()
assert 'H38_SCOUT_V260_FACEBOOK_PUBLIC_FIRST=true' in v260.read_text()
print('PASS applied deterministic v2.6.0 public-only Facebook package layer')
