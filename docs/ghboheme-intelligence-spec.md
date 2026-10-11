# GBoheme Intelligence — Personalization & News Intelligence Specification

**Status:** Approved configuration / implementation pending  
**Project:** GBoheme Intelligence (customization of World Monitor)  
**Baseline:** GBoheme/worldmonitor  
**Date:** 2026-10-11  
**Specification version:** 1.0

> This document defines product requirements and approved user defaults. It does not indicate that any capability has been implemented. This derivative remains subject to the upstream project's AGPL-3.0-only license, attribution requirements, and applicable third-party platform terms.

## 1. Goal / الهدف

إنشاء منصة رصد أخبار عالمية وتقنية شخصية تعمل على الويب وWindows وAndroid؛ تجمع أخبار المصادر المتعددة وتزيل التكرار وتصنفها حسب الاهتمامات، وتقدم ملخصات وتحليلات عربية وإنجليزية وتنبيهات للأحداث المهمة. ويُطوَّر ربط منصات التواصل بموصلات مستقلة وفق الصلاحيات الرسمية المتاحة.

## 2. Approved news categories / تصنيفات الأخبار المعتمدة

جميع التصنيفات التالية **مفعّلة افتراضياً** في النسخة الشخصية، وهي إعدادات قابلة للتغيير وليست قائمة حصرية:

| ID | Arabic label | English label | Enabled |
|---|---|---|---|
| ai_agents | الذكاء الاصطناعي والوكلاء | Artificial Intelligence & Agents | true |
| open_source_github | المشاريع مفتوحة المصدر وGitHub | Open Source & GitHub | true |
| software_platforms | Windows وAndroid والبرامج | Windows, Android & Software | true |
| world_politics | الأخبار العالمية والسياسة | World News & Politics | true |
| cybersecurity | الأمن السيبراني | Cybersecurity | true |
| economy_markets | الاقتصاد والأسواق | Economy & Markets | true |
| energy_oil | الطاقة والنفط | Energy & Oil | true |
| science_discovery | العلوم والاكتشافات | Science & Discoveries | true |
| iraq_local | الأخبار المحلية العراقية | Iraq Local News | true |
| sports_entertainment | الرياضة والترفيه | Sports & Entertainment | true |

التصنيفات قابلة للتداخل، مع السماح بأن تنتمي المادة الواحدة إلى أكثر من قسم دون تكرار البطاقة نفسها في موجز واحد.

## 3. Approved language preferences / اللغات

- **مفعّلة:** العربية (`ar`) والإنجليزية (`en`).
- واجهة عربية باتجاه RTL وخط Cairo؛ إمكانية تبديل اللغة واتجاه عرض المحتوى عند الحاجة.
- لا يجوز استبعاد الخبر لمجرد أنه مكتوب بلغة مصدر ثالث إذا كان خبراً بالغ الأهمية، بل يمكن إدخاله بعد ترجمته مع بيان لغة المصدر.
- يتم الاحتفاظ بعنوان الخبر الأصلي ورابطه واسم المصدر وتاريخ النشر، مع فصل واضح بين النص الأصلي والترجمة والملخص المولد.
- تحديد اللغة يتم للواجهة، ولغة المصدر، ولغة الملخص كحقول مستقلة.

## 4. Approved alerts / سياسة التنبيهات

**الإعداد الافتراضي: تنبيهات الأخبار المهمة فقط (`important_only`).**

لا تُرسل إشعارات لكل مادة جديدة. يجب أن يجتاز الحدث قواعد الأهمية والتحقق من المصدر قبل الإشعار. تشمل الأمثلة: إطلاق نموذج AI رئيسي أو نسخة مهمة من مشروع متابع؛ ثغرة عالية الخطورة مثبتة ذات تأثير فعلي؛ حدث عالمي كبير؛ تطور اقتصادي أو نفطي جوهري؛ أو خبر محلي عراقي ذي أثر واسع.

**خط أنابيب التنبيه:**
1. التقاط الحدث مع وقت النشر ووقت الاكتشاف والمصدر والرابط.
2. توحيد السجلات وتجميع الأخبار المتطابقة والمتعلقة بالحدث نفسه.
3. تصنيف الموضوعات وربطها بتفضيلات المستخدم.
4. تقييم الأهمية بناءً على الأثر والموثوقية والحداثة والنطاق الجغرافي والاهتمام الشخصي.
5. التحقق من الخبر بمصدر أصلي أو أكثر من مصدر مستقل حيثما أمكن، وإظهار حالة عدم التأكد بدلاً من تقديم التنبؤ كخبر مؤكد.
6. منع تكرار التنبيه لنفس الحدث؛ إشعار تحديث لاحق فقط عندما توجد معلومات جوهرية جديدة.
7. عرض سبب التنبيه والمصادر ووقت الحدث وتاريخ الخبر، مع إمكانية إيقاف تنبيهات موضوع أو مصدر.

**مستويات الأهمية المقترحة:**
- `critical`: تنبيه عاجل لحدث واسع الأثر ومتحقق.
- `high`: تنبيه مهم لمستجد جوهري متعلق بالاهتمامات.
- `medium` و`low`: يظهران في الواجهة أو الموجز، ولا يرسلان إشعاراً فورياً في وضع `important_only`.

قواعد التقييم وعتباته ستُضبط وتُختبر ببيانات حقيقية لاحقاً؛ لا تُفترض دقة مصنف آلي قبل التحقق منه.

## 5. Canonical user preference payload

```json
{
  "profile_id": "default",
  "categories": {
    "ai_agents": true,
    "open_source_github": true,
    "software_platforms": true,
    "world_politics": true,
    "cybersecurity": true,
    "economy_markets": true,
    "energy_oil": true,
    "science_discovery": true,
    "iraq_local": true,
    "sports_entertainment": true
  },
  "languages": ["ar", "en"],
  "display_locale": "ar",
  "notification_policy": "important_only",
  "immediate_notification_severities": ["critical", "high"]
}
```

## 6. Platform and social integration requirements

- إعادة استخدام بنية World Monitor الحالية للويب وسطح المكتب، وتطوير تجربة شاشة صغيرة منفصلة؛ البدء بـPWA ثم تقييم بناء Android/Tauri 2 مع اختبار الوظائف فعلياً.
- موصلات مستقلة للأخبار العامة وRSS وGitHub وYouTube وFacebook وX، مع التمييز بين القراءة والنشر والوصول إلى حساب المستخدم المصرّح به.
- أي تكامل حسابي يستخدم OAuth أو آلية المصادقة المعتمدة، أقل الصلاحيات، تخزين رموز آمن على الخادم، حد طلبات ومراقبة أخطاء وتسجيلات قابلة للتدقيق.
- لا يُعتمد الوصول الحر إلى محتوى Facebook/X أو النشر الآلي كميزة مضمونة؛ التوافر يخضع لصلاحيات التطبيق، الحصص، الشروط والرسوم.
- فصل مجموعة المصادر الخام عن تصنيف المواد والتلخيص ومنصة النشر، لضمان أن تعطل مصدر واحد لا يوقف المراقبة كلها.
- مزامنة التفضيلات والأخبار المحفوظة بين الأجهزة وفق هوية المستخدم، مع سياسة خصوصية واضحة.

## 7. Acceptance criteria / معايير القبول

- ظهور الفئات العشر جميعاً وتفعيلها افتراضياً عند بدء إعداد الملف الشخصي.
- دعم واجهة عربية RTL بخط Cairo، والأخبار العربية والإنجليزية.
- تعديل الاهتمامات وحفظها واستعادتها عند إعادة فتح التطبيق وعبر الأجهزة عند تشغيل المزامنة.
- في وضع `important_only`: لا تصدر إشعارات فورية عن أحداث `medium` أو `low`.
- لكل تنبيه مصدر ظاهر، رابط مباشر، تاريخ نشر، سبب الأهمية، ومعالجة واضحة للأخبار غير المؤكدة.
- منع التكرار على مستوى الحدث لا مجرد تطابق العنوان.
- وجود إعدادات لتعطيل مصدر أو موضوع أو إشعارات الهاتف دون تعطيل جمع الأخبار.
- اختبار RTL والوصول الأساسي على الهاتف وWindows والويب قبل إعلان جاهزية هذه المنصات.
- عدم نشر محتوى على أي حساب اجتماعي قبل ربطه رسمياً وتكوين صلاحية نشر مستقلة؛ إنشاء الإعدادات هنا لا يربط الحسابات فعلياً.
- حفظ إشعارات الرخصة ونسب الشيفرة الأصلية المطلوبة في النسخة المشتقة.

## 8. Implementation notes

This specification is the approved design baseline, not running code. Track implementation separately via issues/PRs and verify each acceptance criterion before marking it complete.
