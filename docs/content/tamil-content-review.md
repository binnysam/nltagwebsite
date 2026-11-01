# Tamil content review sheet

**Generated from** `src/content/ui-strings.ts` and `src/content/schedule.ts` by `node scripts/tamil-review.ts`. Do not edit by hand; `npm run verify` fails if this file is out of date.
**Status:** 48 items awaiting church review, all `draft-review`. Times, days and NECK are confirmed (Gate 0); only Tamil wording is under review.

How to review: for each row, approve the recommended Tamil, pick an alternative, or write a replacement. Approved items change to `taStatus: "confirmed"` in the source; nothing in Tamil goes live on a public page before that.

## For church decision: short wording

- **cta.joinFriday** (“Join us this Friday”)
  - Recommended: இந்த வெள்ளிக்கிழமை எங்களுடன் இணையுங்கள்
  - **Short alternative: இந்த வெள்ளிக்கிழமை வாருங்கள்**
  - Why: Gate 0 replaced 'Join us this Sunday' with this wording. Measured 1 Nov 2026 at phone width (390 CSS pixels): the recommended Tamil and the first alternative both wrap to two lines in a full-width pill button; the short alternative fits on one line.

## All items

| ID | English | Recommended Tamil | Alternatives | Note | Status |
|---|---|---|---|---|---|
| schedule.main-worship | Main Worship Service | பிரதான ஆராதனை | சபை ஆராதனை · ஆராதனை |  | Awaiting church review (`draft-review`) |
| schedule.sunday-school | Sunday School | சண்டே ஸ்கூல் | வேதபாட வகுப்பு | Held on Friday. Avoid ஞாயிறு பள்ளி. Confirm audience (children or all ages). | Awaiting church review (`draft-review`) |
| schedule.fasting-prayer | Fasting Prayer | உபவாச ஜெபம் | உபவாச ஜெபக்கூட்டம் |  | Awaiting church review (`draft-review`) |
| schedule.cottage-meeting | Cottage Meeting | வீட்டு ஜெபக்கூட்டம் | குடும்ப ஜெபக்கூட்டம் · காட்டேஜ் மீட்டிங் | Host addresses are never published. | Awaiting church review (`draft-review`) |
| schedule.ladies-meeting | Ladies Meeting | சகோதரிகள் கூட்டம் | பெண்கள் ஜெபக்கூட்டம் · மகளிர் கூட்டம் |  | Awaiting church review (`draft-review`) |
| schedule.special-meetings | Special Meetings | சிறப்புக் கூட்டங்கள் | விசேஷ கூட்டங்கள் |  | Awaiting church review (`draft-review`) |
| time.evening | PM (7:00–9:30 PM gatherings) | மாலை | இரவு | Fasting Prayer, Cottage Meeting, Ladies Meeting | Awaiting church review (`draft-review`) |
| time.morning | AM | காலை | — |  | Awaiting church review (`draft-review`) |
| preview.heroTitle | New Life Tamil AG Church | நியூ லைஃப் தமிழ் ஏ.ஜி. சபை | நியூ லைஃப் தமிழ் அசெம்பிளீஸ் ஆஃப் காட் சபை | Phase 1 preview only; real hero copy is CONTENT REQUIRED | Awaiting church review (`draft-review`) |
| nav.home | Home | முகப்பு | — |  | Awaiting church review (`draft-review`) |
| nav.about | About | எங்களைப் பற்றி | சபையைப் பற்றி |  | Awaiting church review (`draft-review`) |
| nav.worshipTimes | Worship times | ஆராதனை நேரங்கள் | கூடுகை நேரங்கள் |  | Awaiting church review (`draft-review`) |
| nav.sermons | Sermons | பிரசங்கங்கள் | தேவ செய்திகள் |  | Awaiting church review (`draft-review`) |
| nav.contact | Contact | தொடர்பு | தொடர்பு கொள்ள |  | Awaiting church review (`draft-review`) |
| nav.menu | Menu | மெனு | பட்டியல் |  | Awaiting church review (`draft-review`) |
| nav.closeMenu | Close menu | மெனுவை மூடு | — |  | Awaiting church review (`draft-review`) |
| nav.primary | Main navigation | முதன்மை வழிசெலுத்தல் | — |  | Awaiting church review (`draft-review`) |
| nav.skipToContent | Skip to main content | முதன்மை உள்ளடக்கத்திற்குச் செல்லவும் | — |  | Awaiting church review (`draft-review`) |
| cta.joinFriday | Join us this Friday | இந்த வெள்ளிக்கிழமை எங்களுடன் இணையுங்கள் | **Short: இந்த வெள்ளிக்கிழமை வாருங்கள்** · இந்த வெள்ளிக்கிழமை ஆராதனைக்கு வாருங்கள் | Gate 0 replaced 'Join us this Sunday' with this wording. Measured 1 Nov 2026 at phone width (390 CSS pixels): the recommended Tamil and the first alternative both wrap to two lines in a full-width pill button; the short alternative fits on one line. | Awaiting church review (`draft-review`) |
| lang.label | Language | மொழி | — |  | Awaiting church review (`draft-review`) |
| hero.pause | Pause background animation | பின்னணி அசைவை நிறுத்து | — |  | Awaiting church review (`draft-review`) |
| hero.play | Play background animation | பின்னணி அசைவைத் தொடங்கு | — |  | Awaiting church review (`draft-review`) |
| verse.today | Today's verse | இன்றைய வசனம் | இன்றைய தேவ வசனம் |  | Awaiting church review (`draft-review`) |
| verse.placeholderChip | Placeholder | மாதிரி | — | Shown until Bible reproduction permission is confirmed. | Awaiting church review (`draft-review`) |
| verse.placeholderText | Verse text appears here once reproduction permission is confirmed. | மறுபதிப்பு அனுமதி உறுதியானதும் வசனம் இங்கே இடம்பெறும். | — |  | Awaiting church review (`draft-review`) |
| verse.placeholderReference | Reference | வசனக் குறிப்பு | — |  | Awaiting church review (`draft-review`) |
| verse.publisherCredit | Publisher credit line required | வெளியீட்டாளர் நன்றிக் குறிப்பு தேவை | — | Exact credit lines come from the BSI and NKJV permission letters. | Awaiting church review (`draft-review`) |
| verse.share | Share | பகிர் | — |  | Awaiting church review (`draft-review`) |
| verse.download | Download PNG | PNG பதிவிறக்கு | படமாகப் பதிவிறக்கு |  | Awaiting church review (`draft-review`) |
| verse.fallback | Today's verse will be published soon. | இன்றைய வசனம் விரைவில் வெளியிடப்படும். | — |  | Awaiting church review (`draft-review`) |
| schedule.heading | Worship schedule | ஆராதனை அட்டவணை | ஆராதனை நேரங்கள் |  | Awaiting church review (`draft-review`) |
| schedule.col.name | Gathering | கூடுகை | நிகழ்ச்சி |  | Awaiting church review (`draft-review`) |
| schedule.col.when | When | நேரம் | — |  | Awaiting church review (`draft-review`) |
| schedule.col.where | Where | இடம் | — |  | Awaiting church review (`draft-review`) |
| schedule.timezone | All times are Kuwait time. | அனைத்து நேரங்களும் குவைத் நேரம். | — |  | Awaiting church review (`draft-review`) |
| status.draft | Draft | வரைவு | — |  | Awaiting church review (`draft-review`) |
| status.emailVerified | Email verified | மின்னஞ்சல் சரிபார்க்கப்பட்டது | — |  | Awaiting church review (`draft-review`) |
| status.pendingReview | Pending review | பரிசீலனையில் | — |  | Awaiting church review (`draft-review`) |
| status.correctionRequested | Correction requested | திருத்தம் கோரப்பட்டுள்ளது | — |  | Awaiting church review (`draft-review`) |
| status.active | Active | செயலில் | நடப்பில் |  | Awaiting church review (`draft-review`) |
| status.rejected | Rejected | நிராகரிக்கப்பட்டது | — |  | Awaiting church review (`draft-review`) |
| form.required | Required | அவசியம் | — |  | Awaiting church review (`draft-review`) |
| form.optional | Optional | விருப்பத்தேர்வு | — |  | Awaiting church review (`draft-review`) |
| form.errorRequired | This field is required. | இந்தப் புலம் அவசியம். | — |  | Awaiting church review (`draft-review`) |
| form.loading | Please wait… | காத்திருக்கவும்… | — |  | Awaiting church review (`draft-review`) |
| site.inPreparation | This website is being prepared. | இந்த இணையதளம் தயாராகி வருகிறது. | — |  | Awaiting church review (`draft-review`) |
| special.typeLabel | Special meeting | சிறப்புக் கூட்டம் | — |  | Awaiting church review (`draft-review`) |
| special.empty | Special meetings are announced individually. | சிறப்புக் கூட்டங்கள் தனித்தனியாக அறிவிக்கப்படும். | — |  | Awaiting church review (`draft-review`) |
