---
name: multiformat-image
disable-model-invocation: true
description: "PNG를 WebP·스프라이트용 다형식으로 변환한다. 생성된 이미지 에셋의 파일 크기를 줄이거나 스프라이트로 묶을 때 사용한다."
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
