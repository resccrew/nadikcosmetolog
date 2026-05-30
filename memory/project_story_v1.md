---
name: story-v1-backup
description: "верни 1" = restore story_v1.html to story.html. story_v1.html is the horizontal-scroll + vertical-directions hybrid with media grids.
metadata:
  type: project
---

Если пользователь пишет "верни 1" — скопировать story_v1.html обратно в story.html:
```bash
cp "story_v1.html" "story.html"
```

**Why:** пользователь попросил сохранить working версию перед экспериментальным Apple-style редизайном.

**How to apply:** при команде "верни 1" выполнить bash cp и сообщить что версия восстановлена.
