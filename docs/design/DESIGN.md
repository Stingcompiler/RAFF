# رَفّ — ملاحظات المشروع على المرجع (الخطوط والأرقام)

المرجع العام هو `Design-Reference-v2.2.md` ويبقى فوق هذا الملف. هنا ما يخص رَفّ فقط، والقرار في `DECISIONS.md › D-R0014`.

## العائلة والأوزان

IBM Plex Sans Arabic للعربية وIBM Plex Sans للاتينية، الأوزان 400/500/600/700، محلية من `@fontsource` (المقطعان `arabic` و`latin` فقط)، `font-display: swap`، احتياط `system-ui`. المتغيرات في `:root` (مولّدة في `tokens.css`): `--font-ui` و`--font-mono` و`--font-display`، والأخيران يساويان الأول. في نص إنجليزي (`:lang(en)`) تُقلَب الأولوية إلى اللاتينية.

## السلّم

| الاسم     | الحجم | السطر | الاستخدام                        |
| --------- | ----- | ----- | -------------------------------- |
| `caption` | 12    | 1.6   | تعليقات وأوقات التحديث (أدنى حد) |
| `label`   | 13    | 1.4   | تسميات ورؤوس جداول               |
| `body`    | 14    | 1.6   | النص الأساسي                     |
| `lead`    | 16    | 1.6   | أزرار كبيرة ومدخلات              |
| `section` | 20    | 1.3   | عناوين الأقسام                   |
| `page`    | 28    | 1.25  | عنوان الصفحة                     |
| `metric`  | 32    | 1.1   | قيمة المؤشر                      |
| `total`   | 36    | 1.1   | إجمالي نقطة البيع                |

المتجر والتعريف (LANDING §7، سطح مكتب/جوال): `land-hero` 52/30، `land-hero-lead` 18/15، `land-section` 32/24، `land-feature` 24/20، `land-lead` 17/15، `land-body` 16/15. الأوزان: `font-normal|medium|semibold|bold`. الأسطر: `leading-tight|snug|body|loose`.

## الأرقام

`.num` (و`[data-num]`): `font-family: var(--font-mono, var(--font-ui)); font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate`. على المبالغ والتواريخ والأوقات والمعرّفات والهواتف والأكواد وعدّادات الشارات والخطوات. عمود المبالغ بمحاذاة النهاية (`NumberCell` تلفّ القيمة بـ`.num` داخل خلية `text-end`)، والتواريخ والأكواد بمحاذاة البداية داخل عنصر معزول (`CodeCell`).

## الفحص

- `raff/no-raw-font` (ESLint): يمنع `text-[Npx]` و`leading-[…]` و`font-[…]` و`[font-family:…]` وقيم الخط في `style`.
- `tests/e2e/typography.spec.ts`: العائلات والأوزان المعلنة، وزن خطوط أول عرض (الدخول) ≤ 200KB، لا نص أصغر من 12px، لا رقم/تاريخ/معرّف خارج `.num` ولا مبلغ بمحاذاة البداية، على 11 صفحة عمل و7 صفحات متجر.
