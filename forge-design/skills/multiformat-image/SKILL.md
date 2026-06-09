---
name: multiformat-image
description: PNG → WebP/sprite-ready 다형식 이미지 변환. Use for: (1) PNG to WebP 변환 (파일 크기 최소화), (2) 스프라이트시트 생성 (여러 PNG → 단일 시트), (3) 게임 에셋 형식 변환. PIL(Pillow) 또는 ImageMagick 사용. SKIP: 이미지 생성 (/image-orchestrate), 단순 이미지 표시.
input: 이미지 파일 경로 + 목표 형식 (webp|sprite|all)
output: 변환된 이미지 파일 + 변환 보고서
---

# multiformat-image

PNG → WebP / 스프라이트 변환 도구.

## 의존성

```bash
pip install Pillow  # WebP 변환
# 또는
apt install imagemagick  # 고급 변환
```

## 사용법

```bash
# 단일 PNG → WebP
/multiformat-image ./warrior-01.png webp

# 디렉토리 전체 변환
/multiformat-image ./AI_Generated/Characters/ webp

# 스프라이트 시트 생성
/multiformat-image ./AI_Generated/Effects/ sprite --cols 4
```

## Python 변환 코드

```python
from PIL import Image
img = Image.open(src).convert("RGBA")
img.save(dst.replace(".png", ".webp"), "WEBP", quality=90)
```

## 스프라이트 시트

```python
# N×M 그리드로 합성
frames = [Image.open(f) for f in sorted(glob("*.png"))]
cols = 4; rows = ceil(len(frames) / cols)
sheet = Image.new("RGBA", (cols*W, rows*H))
for i, f in enumerate(frames):
    sheet.paste(f, ((i%cols)*W, (i//cols)*H))
sheet.save("spritesheet.png")
```
