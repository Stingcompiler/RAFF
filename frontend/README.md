# الواجهة (Next.js)

```bash
pnpm install              # من جذر المستودع (مساحة عمل pnpm)
pnpm --dir frontend dev   # http://localhost:3000 — يمرّر /api/* إلى RAFF_API_ORIGIN (افتراضياً localhost:8000)
pnpm --dir frontend build && pnpm --dir frontend start
pnpm --dir frontend lint       # ESLint + stylelint + Prettier + اختبار القواعد المخصصة (lint-tests/)
pnpm --dir frontend typecheck  # tsc --noEmit
pnpm --dir frontend openapi    # يولّد src/lib/api/schema.d.ts من backend/openapi/schema.yaml
```

- الألوان في `src/styles/tokens.css` وحده، ومربوطة في `@theme`. لوحة Tailwind الافتراضية محذوفة.
- النصوص في `messages/ar.json` و`messages/en.json`. اللغة من المسار في `(marketing)/[locale]`، ومن ملف تعريف الارتباط `NEXT_LOCALE` في بقية المسارات، والافتراضي العربية. الثيم من `raff-theme`.
- قواعد الفحص المخصصة في `lint-rules/`، واختباراتها السلبية في `lint-tests/`.
- مكوّنات التصميم في `src/components/ui/` (ملف لكل مكوّن)، ومكوّنات المتجر في `src/components/storefront/`، والقشرة في `src/components/shell/`.
- صفحات المراجعة: `/dev/components` (كل مكوّن بحالاته بالثيمين)، `/dev/shell`، `/dev/dialog`. متاحة في `next dev`، أو مع `RAFF_DEV_ROUTES=1`.
- بلا Tailwind preflight، وقيم التصميم تُنقل كما هي: راجع `docs/spec/decisions/0002-browser-defaults-no-preflight.md`.
