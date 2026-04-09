# 牌图资源目录

将牌图资源放在这里，前端会自动按固定路径读取。

## 目录示例

```text
public/assets/decks/
  rider-waite/
    back.jpg
    blank-special.jpg
    major-0.jpg
    major-1.jpg
    ...
    major-21.jpg
    wands-ace.jpg
    wands-2.jpg
    ...
    wands-king.jpg
    cups-ace.jpg
    ...
  mystic-echo/
    back.jpg
    ...
```

## 命名规则

- 大阿尔卡那：`major-0.jpg` 到 `major-21.jpg`
- 小阿尔卡那数字牌：`wands-ace.jpg`、`cups-2.jpg`、`swords-10.jpg`、`pentacles-3.jpg`
- 宫廷牌：`wands-page.jpg`、`cups-knight.jpg`、`swords-queen.jpg`、`pentacles-king.jpg`
- 空白牌：`blank-special.jpg`
- 牌背：`back.jpg`

支持你自行改成 `.png` 或其他格式，但要同步修改 `src/data/decks/factory.ts` 里的生成规则。
