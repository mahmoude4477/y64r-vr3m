/**
 * Global simulation scenarios. OWNER: the simulations feature team.
 * PRODUCT.md section 3: at least one scenario per seed protocol (two for sharps safety and blood spills).
 *
 * MEDICAL REVIEW PENDING: educational content based on WHO / CDC / OSHA guidance (cited in the feedback and,
 * per step, in prisma/seed/protocols.ts). The whole file must be reviewed by the medical members of the team
 * before institutional use (PRODUCT 3); it never replaces a facility's own policies. The schema has no review
 * flag on Scenario yet (requested from the foundation: Scenario.medicalReviewedAt), so the pages show the
 * educational disclaimer instead. Lines marked "MEDICAL REVIEW:" carry an open question.
 *
 * Rules the seed enforces (prisma/seed/index.ts) and lib/simulations/seed-content.test.ts re-checks:
 * - `protocolSlug` must exist in protocols.ts; `stepKey` must be a step key of that protocol.
 * - Every option carries feedback (why it is right or wrong) in both languages.
 * - A "single" stage has exactly one correct option; a "multi" stage has at least one (and, here, at least one
 *   wrong option too). 4-7 stages per scenario, both kinds in each scenario.
 * - The seed creates a scenario (with stages/options) only when its slug does not exist yet; on later
 *   runs it updates the scenario's own fields but leaves stages/options alone (attempt history points at
 *   them). Change seeded stages through the admin editor, or reset the local dev database.
 *
 * How options map to steps (lib/scoring.ts): a step is compliant when every option mapped to it was answered
 * right (correct ones chosen, wrong ones avoided). An option says which step its choice concerns. A correct
 * option of a "single" stage is left unmapped when its wrong options already cover every step the stage tests,
 * so choosing one wrong option violates only the step that option breaks. `isCritical` marks wrong options
 * that real practice treats as an automatic high risk:
 * - touching a used needle or lancet with the fingers: recapping it, holding it, picking it up, pressing down on
 *   or reaching into a sharps container (OSHA 29 CFR 1910.1030(d)(2)(vii): contaminated needles are not recapped,
 *   bent or removed except with a device or a one-handed technique; CDC Standard Precautions: no hand manipulation);
 * - blood or body fluids without gloves; eating or drinking in the laboratory.
 * Broken glass in a blood spill picked up by hand is left non-critical until the medical members decide (marked
 * below); handing a sharp to a colleague and carrying a capped or uncapped syringe body are wrong but not critical.
 */

export type ScenarioOptionSeed = {
  textAr: string;
  textEn: string;
  isCorrect: boolean;
  /** Choosing this (wrong) option violates its step critically (automatic high risk). */
  isCritical?: boolean;
  /** ProtocolStep.key in the scenario's protocol; omit when the option says nothing about a step. */
  stepKey?: string;
  feedbackAr: string;
  feedbackEn: string;
};

export type ScenarioStageSeed = {
  kind: "single" | "multi";
  promptAr: string;
  promptEn: string;
  contextAr?: string;
  contextEn?: string;
  options: ScenarioOptionSeed[];
};

export type ScenarioSeed = {
  slug: string;
  protocolSlug: string;
  titleAr: string;
  titleEn: string;
  introAr: string;
  introEn: string;
  settingAr: string;
  settingEn: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  isPublished?: boolean;
  stages: ScenarioStageSeed[];
};

export const scenarios: ScenarioSeed[] = [
  // 1 ── sharps safety (core) ─────────────────────────────────────────────────────────────────────
  {
    slug: "used-needle-after-injection",
    protocolSlug: "sharps-safety",
    titleAr: "إبرة مستعملة بعد حقنة الأنسولين",
    titleEn: "A used needle after an insulin injection",
    introAr: "أعطِ حقنة تحت الجلد لمريض في جناح الباطنية، وقرّر ماذا تفعل بالإبرة من تجهيز الصينية حتى ما بعد إصابة وخز محتملة.",
    introEn: "Give a subcutaneous injection on a medical ward and decide what happens to the needle, from preparing the tray to a possible needlestick.",
    settingAr:
      "مستشفى عام في الرياض، جناح الباطنية للرجال، الساعة السادسة صباحًا. أنت في المناوبة الصباحية، وعليك إعطاء جرعة الأنسولين للمريض في الغرفة 214 قبل وجبة الإفطار. غرفة التحضير في آخر الممر، على بُعد نحو عشرين مترًا من الغرفة.",
    settingEn:
      "A general hospital in Riyadh, men’s medical ward, 6 a.m. You are on the morning shift and must give the insulin dose to the patient in room 214 before breakfast. The treatment room is at the end of the corridor, about twenty metres from the room.",
    difficulty: "beginner",
    estimatedMinutes: 6,
    stages: [
      {
        kind: "single",
        contextAr: "أنت في غرفة التحضير تجهّز الصينية: المحقنة، ومسحة كحولية، وقطنة. حاوية الأدوات الحادة الثابتة معلّقة هنا في غرفة التحضير.",
        contextEn: "You are in the treatment room preparing the tray: syringe, alcohol swab and cotton ball. The fixed sharps container is mounted here, in the treatment room.",
        promptAr: "كيف ستتخلص من الإبرة بعد الحقنة؟",
        promptEn: "How will you dispose of the needle after the injection?",
        options: [
          {
            textAr: "أعود بالمحقنة إلى غرفة التحضير بعد الحقنة، وأتخلص منها في الحاوية المعلّقة هناك.",
            textEn: "I walk the used syringe back to the treatment room and drop it in the mounted container there.",
            isCorrect: false,
            stepKey: "no-hand-carry",
            feedbackAr:
              "غير صحيح. حمل إبرة مستعملة مكشوفة عشرين مترًا في ممر مزدحم يعرّضك ويعرّض غيرك للوخز. القاعدة أن تُحضر الحاوية إلى مكان الاستخدام، لا أن تحمل الأداة الحادة إلى الحاوية.",
            feedbackEn:
              "Not right. Carrying an exposed used needle twenty metres down a busy corridor puts you and others at risk of a needlestick. Bring the container to the point of use, not the sharp to the container.",
          },
          {
            textAr: "آخذ حاوية أدوات حادة صغيرة محمولة على الصينية، لتكون في متناول يدي بجانب السرير.",
            textEn: "I take a small portable sharps container on the tray, so it is within reach at the bedside.",
            isCorrect: true,
            stepKey: "container-at-point-of-use",
            feedbackAr:
              "صحيح. توصي منظمة الصحة العالمية بأن تكون حاوية الأدوات الحادة في متناول اليد عند نقطة الاستخدام، فتتخلص من الإبرة لحظة انتهائك دون أن تحملها أو تضعها على أي سطح.",
            feedbackEn:
              "Correct. WHO advises keeping the sharps container within arm’s reach at the point of use, so the needle goes in the moment you finish, without carrying it or putting it down anywhere.",
          },
          {
            textAr: "أضع المحقنة المستعملة في طبق كلوي على الصينية، وأتخلص منها مع بقية الأدوات في نهاية الجولة.",
            textEn: "I put the used syringe in a kidney dish on the tray and dispose of it with everything else at the end of the round.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. ترك الأدوات الحادة في طبق أو على صينية من أكثر أسباب إصابات الوخز بين الزملاء وعمال النظافة. يجب التخلص من الإبرة فور استخدامها في حاوية الأدوات الحادة (منظمة الصحة العالمية).",
            feedbackEn:
              "Not right. Sharps left in a dish or on a tray are a leading cause of needlesticks among colleagues and cleaners. Discard the needle into a sharps container immediately after use (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "عند سرير المريض تلاحظ أن الحاوية المحمولة ممتلئة حتى خط الامتلاء، وطرف محقنة يبرز قليلًا من فتحتها.",
        contextEn: "At the bedside you notice the portable container is filled up to its fill line, and the end of a syringe sticks out slightly from its opening.",
        promptAr: "ماذا تفعل قبل أن تعطي الحقنة؟",
        promptEn: "What do you do before you give the injection?",
        options: [
          {
            textAr: "أضغط المحتويات إلى الأسفل بيدي لأفسح مكانًا لمحقنة أخرى.",
            textEn: "I press the contents down by hand to make room for one more syringe.",
            isCorrect: false,
            // MEDICAL REVIEW: proposed critical (direct handling of used sharps, like recapping).
            isCritical: true,
            stepKey: "container-fill-line",
            feedbackAr:
              "خطأ جسيم. الضغط على محتويات حاوية الأدوات الحادة باليد قد يدفع إبرة مستعملة في يدك مباشرة. لا تُضغط الحاوية ولا تُفتح ولا تُفرَّغ أبدًا (منظمة الصحة العالمية).",
            feedbackEn:
              "Serious error. Pressing down on the contents of a sharps container can drive a used needle straight into your hand. A sharps container is never pressed, opened or emptied (WHO).",
          },
          {
            textAr: "أستخدمها هذه المرة فقط، فما زال في الفتحة مكان لمحقنة واحدة.",
            textEn: "I use it just this once; there is still room in the opening for one syringe.",
            isCorrect: false,
            stepKey: "container-fill-line",
            feedbackAr:
              "غير صحيح. إدخال محقنة في حاوية بلغت خط الامتلاء قد يدفع المحقنة البارزة نحو يدك. خط الامتلاء حدّ نهائي لا يُتجاوز.",
            feedbackEn:
              "Not right. Forcing a syringe into a container at its fill line can push the protruding one towards your hand. The fill line is a hard limit.",
          },
          {
            textAr: "أغلق الحاوية إغلاقًا نهائيًا، وأحضر حاوية جديدة فارغة قبل أن أبدأ.",
            textEn: "I lock the container closed for good and fetch a new empty one before I start.",
            isCorrect: true,
            stepKey: "container-fill-line",
            feedbackAr:
              "صحيح. تُغلق الحاوية وتُستبدل عند امتلاء ثلاثة أرباعها أو بلوغ خط الامتلاء، لأن الحاوية الممتلئة تدفع الأدوات الحادة إلى الخارج عند إدخال أداة جديدة (منظمة الصحة العالمية).",
            feedbackEn:
              "Correct. A container is closed and replaced once it is three-quarters full or at the fill line, because an overfilled container pushes sharps back out when the next one goes in (WHO).",
          },
          {
            textAr: "أسحب المحقنة البارزة وأنقلها إلى حاوية أخرى، ثم أستخدم هذه الحاوية.",
            textEn: "I pull out the protruding syringe, move it to another container, then use this one.",
            isCorrect: false,
            // MEDICAL REVIEW: proposed critical (taking a used sharp back out of the container by hand).
            isCritical: true,
            stepKey: "container-fill-line",
            feedbackAr:
              "خطأ جسيم. إخراج أداة حادة مستعملة من الحاوية باليد تعامل مباشر مع إبرة ملوثة. ما يدخل حاوية الأدوات الحادة لا يخرج منها أبدًا.",
            feedbackEn:
              "Serious error. Pulling a used sharp back out of the container means handling a contaminated needle directly. Nothing that goes into a sharps container ever comes back out.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "أعطيت الحقنة والحاوية الجديدة بجانبك. خرجت الإبرة من الجلد الآن، والمريض يطلب منك أن تعدّل وسادته.",
        contextEn: "You have given the injection with the new container beside you. The needle is out of the skin, and the patient asks you to fix his pillow.",
        promptAr: "ما خطوتك التالية مع المحقنة؟",
        promptEn: "What is your next move with the syringe?",
        options: [
          {
            textAr: "أُعيد الغطاء إلى الإبرة بكلتا يديّ حتى تصبح آمنة، ثم أعدّل الوسادة.",
            textEn: "I put the cap back on the needle with both hands to make it safe, then fix the pillow.",
            isCorrect: false,
            isCritical: true,
            stepKey: "no-recap",
            feedbackAr:
              "خطأ جسيم. إعادة تغطية الإبرة بكلتا اليدين من أشهر أسباب إصابات الوخز ونقل التهاب الكبد B وC وفيروس نقص المناعة البشرية. لا تُعِد تغطية الإبرة المستعملة، بل ارمها مكشوفة في الحاوية فورًا (الاحتياطات القياسية، CDC).",
            feedbackEn:
              "Serious error. Two-handed recapping is one of the best-known causes of needlesticks and of hepatitis B, hepatitis C and HIV exposure. Do not recap a used needle; drop it uncapped into the container straight away (CDC Standard Precautions).",
          },
          {
            textAr: "أضعها على الطاولة الجانبية لحظةً لأعدّل الوسادة، ثم أرميها في الحاوية.",
            textEn: "I lay it on the bedside table for a moment to fix the pillow, then put it in the container.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. «لحظة» على الطاولة تكفي لأن تُنسى الإبرة أو تصيب المريض أو زميلك. الأداة الحادة لا توضع على أي سطح، بل تذهب إلى الحاوية مباشرة.",
            feedbackEn:
              "Not right. A ‘moment’ on the table is enough for the needle to be forgotten or to injure the patient or a colleague. A sharp never goes down on a surface; it goes straight into the container.",
          },
          {
            textAr: "أرمي المحقنة بإبرتها مكشوفة في الحاوية التي بجانبي فورًا، ثم ألتفت إلى المريض.",
            textEn: "I drop the syringe with its needle, uncapped, into the container beside me at once, then turn to the patient.",
            isCorrect: true,
            feedbackAr:
              "صحيح. التخلص الفوري عند نقطة الاستخدام دون إعادة التغطية هو الإجراء الأكثر أمانًا. يستطيع المريض أن ينتظر ثانيتين، أما الإبرة المكشوفة في يدك فخطر مستمر.",
            feedbackEn:
              "Correct. Immediate disposal at the point of use, without recapping, is the safest action. The patient can wait two seconds; an exposed needle in your hand is a constant risk.",
          },
          {
            textAr: "أغطيها بيد واحدة بتقنية الغَرْف، ثم أحملها إلى حاوية غرفة التحضير لاحقًا.",
            textEn: "I recap it one-handed with the scoop technique, then carry it to the treatment-room container later.",
            isCorrect: false,
            stepKey: "no-hand-carry",
            feedbackAr:
              "غير صحيح. تقنية الغَرْف بديل احتياطي فقط حين لا يمكن تجنّب إعادة التغطية، والحاوية هنا بجانبك. ثم إن حمل الأداة الحادة إلى مكان آخر يضيف خطرًا لا حاجة إليه.",
            feedbackEn:
              "Not right. The scoop technique is only a fallback when recapping cannot be avoided, and here the container is beside you. Carrying the sharp elsewhere adds a risk for nothing.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "وأنت تغادر، يشير مرافق المريض إلى واخزة سكر مستعملة تركها زميل على طاولة الطعام، ويطلب منك إزالتها.",
        contextEn: "As you leave, the patient’s companion points to a used glucose lancet a colleague left on the overbed table and asks you to remove it.",
        promptAr: "كيف تتعامل مع الواخزة؟",
        promptEn: "How do you deal with the lancet?",
        options: [
          {
            textAr: "ألتقطها بأصابعي وأحملها إلى غرفة التحضير.",
            textEn: "I pick it up with my fingers and carry it to the treatment room.",
            isCorrect: false,
            // MEDICAL REVIEW: proposed critical (a used lancet picked up and carried with the fingers).
            isCritical: true,
            stepKey: "no-hand-carry",
            feedbackAr:
              "خطأ جسيم. حمل الواخزة المستعملة بين أصابعك في الممر فرصة جديدة للوخز في كل خطوة، والحاوية معك في الغرفة. الأداة الحادة المستعملة لا تُمسك باليد (الاحتياطات القياسية، CDC).",
            feedbackEn:
              "Serious error. Carrying a used lancet between your fingers down the corridor is another chance of injury with every step, and the container is with you in the room. A used sharp is never handled with the fingers (CDC Standard Precautions).",
          },
          {
            textAr: "ألفّها بمنديل ورقي وأرميها في سلة النفايات العامة في الغرفة.",
            textEn: "I wrap it in a tissue and throw it in the room’s general waste bin.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. المنديل لا يمنع الطرف الحاد من الاختراق، وعامل النظافة الذي يجمع الكيس هو من سيُصاب. الأدوات الحادة مكانها حاوية الأدوات الحادة فقط.",
            feedbackEn:
              "Not right. A tissue does not stop the point going through, and the cleaner who handles the bag is the one who gets injured. Sharps belong in a sharps container only.",
          },
          {
            textAr: "أقرّب الحاوية من الطاولة، وأُسقط الواخزة فيها ممسكًا بجسمها بعيدًا عن طرفها الحاد.",
            textEn: "I bring the container right next to the table and drop the lancet in, holding it by its body, away from the tip.",
            isCorrect: true,
            feedbackAr:
              "صحيح. نقل الحاوية إلى الأداة الحادة لا العكس يقلل المسافة التي تُحمل فيها. ثم أخبر زميلك بلطف حتى لا تُترك الأدوات الحادة مرة أخرى (منظمة الصحة العالمية).",
            feedbackEn:
              "Correct. Moving the container to the sharp, not the other way round, keeps the distance it travels to a minimum. Then tell your colleague, kindly, so sharps are not left out again (WHO).",
          },
          {
            textAr: "أتركها لعامل النظافة، فهو سيمر بعد قليل.",
            textEn: "I leave it for the cleaner, who will come by soon.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. كل دقيقة تبقى فيها الواخزة مكشوفة خطر على المريض ومرافقه وعامل النظافة. من يرى أداة حادة متروكة يتخلص منها بأمان فورًا.",
            feedbackEn:
              "Not right. Every minute the lancet stays out is a risk to the patient, his companion and the cleaner. Whoever sees a sharp left out disposes of it safely at once.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "في آخر المناوبة، وأنت تُسقط إبرة في الحاوية، تنزلق يدك فتخترق الإبرة القفاز وتجرح إصبعك.",
        contextEn: "Late in the shift, as you drop a needle into the container, your hand slips and the needle goes through your glove into your finger.",
        promptAr: "اختر كل ما يجب فعله الآن.",
        promptEn: "Choose everything you should do now.",
        options: [
          {
            textAr: "أغسل موضع الوخز فورًا بالماء الجاري والصابون.",
            textEn: "Wash the puncture site at once with running water and soap.",
            isCorrect: true,
            stepKey: "report-injury",
            feedbackAr: "صحيح. الغسل الفوري بالماء والصابون هو الإسعاف الأولي الموصى به، ويقلل كمية الدم الملوث في الجرح.",
            feedbackEn: "Correct. Washing at once with soap and water is the recommended first aid and reduces the contaminated blood in the wound.",
          },
          {
            textAr: "أعصر الإصبع بقوة ليخرج الدم الملوث.",
            textEn: "Squeeze the finger hard to push the contaminated blood out.",
            isCorrect: false,
            stepKey: "report-injury",
            feedbackAr: "غير صحيح. عصر الجرح لا يقلل خطر العدوى ولا يُنصح به، وقد يزيد الضرر في الأنسجة. اكتفِ بالغسل الجيد.",
            feedbackEn: "Not right. Squeezing the wound does not lower the infection risk and is not recommended; it may damage the tissue. Washing well is enough.",
          },
          {
            textAr: "أبلغ مشرفي وقسم صحة الموظفين أو مكافحة العدوى فورًا، دون انتظار نهاية المناوبة.",
            textEn: "Report it immediately to my supervisor and to employee health or infection control, without waiting for the end of the shift.",
            isCorrect: true,
            stepKey: "report-injury",
            // MEDICAL REVIEW: timing wording for post-exposure prophylaxis ("ideally within a few hours").
            feedbackAr:
              "صحيح. التقييم السريع بعد التعرض يحدد الحاجة إلى الوقاية الدوائية، وهي أكثر فاعلية كلما بدأت أبكر، ويُفضَّل أن تبدأ خلال ساعات قليلة (OSHA ومراكز CDC).",
            feedbackEn:
              "Correct. Prompt assessment after an exposure decides whether post-exposure prophylaxis is needed; it works best when started early, ideally within a few hours (OSHA, CDC).",
          },
          {
            textAr: "أنقع الإصبع في مُبيِّض أو مطهر قوي.",
            textEn: "Soak the finger in bleach or a strong disinfectant.",
            isCorrect: false,
            stepKey: "report-injury",
            feedbackAr: "غير صحيح. المواد الكاوية مثل المبيّض تضر الجلد، ولم يثبت أنها تقلل انتقال العدوى؛ الماء والصابون يكفيان (CDC).",
            feedbackEn: "Not right. Caustic agents such as bleach damage the skin and have not been shown to reduce transmission; soap and water are enough (CDC).",
          },
          {
            textAr: "أسجّل اسم المريض الذي استُخدمت له الإبرة، ليُقيَّم خطر المصدر.",
            textEn: "Note which patient the needle was used on, so the source risk can be assessed.",
            isCorrect: true,
            stepKey: "report-injury",
            feedbackAr:
              "صحيح. معرفة المريض المصدر تساعد فريق صحة الموظفين على تقييم خطر التهاب الكبد B وC وفيروس نقص المناعة واتخاذ القرار المناسب بسرعة.",
            feedbackEn: "Correct. Knowing the source patient helps employee health assess the hepatitis B, hepatitis C and HIV risk and decide quickly.",
          },
          {
            textAr: "أضع لاصقًا وأكمل عملي، ولا أبلغ إلا إذا ظهرت عليّ أعراض لاحقًا.",
            textEn: "Put on a plaster and carry on, and report only if symptoms appear later.",
            isCorrect: false,
            stepKey: "report-injury",
            feedbackAr:
              "غير صحيح. العدوى المنقولة بالدم قد لا تُظهر أعراضًا لأسابيع أو أشهر، وانتظار الأعراض يضيّع الوقت الذي تكون فيه الوقاية الدوائية أكثر فاعلية.",
            feedbackEn:
              "Not right. Bloodborne infections may show no symptoms for weeks or months, and waiting for symptoms wastes the time in which prophylaxis works best.",
          },
        ],
      },
    ],
  },

  // 2 ── sharps safety ─────────────────────────────────────────────────────────────────────────────
  {
    slug: "cannula-in-emergency",
    protocolSlug: "sharps-safety",
    titleAr: "تركيب قنية وريدية في قسم الطوارئ",
    titleEn: "Inserting an IV cannula in the emergency department",
    introAr: "في طوارئ مزدحمة، تتعامل مع إبرة القنية الوريدية، وحاوية توشك أن تمتلئ، وزميل يهمّ بإعادة تغطية إبرة.",
    introEn: "In a crowded emergency department, deal with a cannula needle, a container that is filling up and a colleague about to recap a needle.",
    settingAr:
      "قسم الطوارئ في مستشفى تعليمي بجدة، مساء الخميس. الممرات مزدحمة، ووصل مريض مصاب بجفاف شديد يحتاج إلى قنية وريدية ومحاليل على الفور. أنت الممرض المسؤول عن السرير رقم 7.",
    settingEn:
      "The emergency department of a teaching hospital in Jeddah, on a Thursday evening. The corridors are crowded, and a patient with severe dehydration needs an IV cannula and fluids right away. You are the nurse responsible for bed 7.",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    stages: [
      {
        kind: "single",
        contextAr: "عند السرير 7 تجد حامل حاوية الأدوات الحادة المثبت على الجدار فارغًا؛ فقد نُقلت الحاوية إلى سرير آخر.",
        contextEn: "At bed 7 you find the wall bracket for the sharps container empty: the container was moved to another bed.",
        promptAr: "ماذا تفعل قبل تركيب القنية؟",
        promptEn: "What do you do before inserting the cannula?",
        options: [
          {
            textAr: "أبدأ فورًا لأن المريض يحتاج المحاليل، وأضع الإبرة على صينية الأدوات حتى أنتهي.",
            textEn: "I start straight away because the patient needs fluids, and put the needle on the instrument tray until I finish.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. الإبرة المستعملة على الصينية في مكان مزدحم خطر على كل من يمد يده إليها. إحضار الحاوية يستغرق أقل من دقيقة ولا يؤخر العلاج فعليًا.",
            feedbackEn:
              "Not right. A used needle on the tray in a crowded bay is a hazard to anyone who reaches for it. Fetching a container takes under a minute and does not really delay treatment.",
          },
          {
            textAr: "أحضر حاوية من المخزن أو من سرير قريب، وأضعها قائمة ومستقرة في متناول يدي قبل البدء.",
            textEn: "I fetch a container from the store or a nearby bed and set it upright and stable within reach before I start.",
            isCorrect: true,
            stepKey: "container-at-point-of-use",
            feedbackAr:
              "صحيح. وجود حاوية مستقرة في متناول اليد قبل البدء هو ما يجعل التخلص الفوري من إبرة القنية ممكنًا، خاصة إذا تحرك المريض فجأة (منظمة الصحة العالمية).",
            feedbackEn:
              "Correct. A stable container within reach before you start is what makes immediate disposal of the cannula needle possible, especially if the patient moves suddenly (WHO).",
          },
          {
            textAr: "أمسك الإبرة بيدي حتى أثبّت القنية، ثم أمشي بها إلى أقرب حاوية.",
            textEn: "I hold the needle in my hand until the cannula is secured, then walk it to the nearest container.",
            isCorrect: false,
            // MEDICAL REVIEW: proposed critical (a bare used needle held in the hand, then carried).
            isCritical: true,
            stepKey: "no-hand-carry",
            feedbackAr:
              "خطأ جسيم. الإمساك بالإبرة أثناء تثبيت القنية ثم المشي بها في ممر مزدحم يضاعف فرص الوخز لك ولمن حولك. تُرمى الإبرة في الحاوية لحظة سحبها (منظمة الصحة العالمية).",
            feedbackEn:
              "Serious error. Holding the needle while you secure the cannula and then walking it through a crowded corridor doubles the chances of a needlestick for you and those around you. The needle goes into the container the moment it comes out (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "دخلت القنية الوريد. وأنت تسحب إبرتها يسحب المريض ذراعه فجأة من الألم، وزميلك يقف بجانبك.",
        contextEn: "The cannula is in the vein. As you withdraw its needle, the patient suddenly pulls his arm away in pain. Your colleague is standing next to you.",
        promptAr: "ماذا تفعل بإبرة القنية؟",
        promptEn: "What do you do with the cannula needle?",
        options: [
          {
            textAr: "أناولها لزميلي ليتخلص منها بينما أثبّت ذراع المريض.",
            textEn: "I hand it to my colleague to dispose of while I steady the patient’s arm.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. مناولة الأدوات الحادة يدًا بيد من الأسباب المعروفة للوخز، خاصة في لحظة توتر. يتخلص منها من استخدمها، وفورًا.",
            feedbackEn:
              "Not right. Passing sharps from hand to hand is a known cause of needlesticks, especially in a tense moment. The person who used the sharp disposes of it, at once.",
          },
          {
            textAr: "أضعها على السرير بجانب المريض لأحرر يديّ.",
            textEn: "I put it on the bed next to the patient to free my hands.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr:
              "غير صحيح. الإبرة على السرير قد تصيب المريض نفسه، أو تختفي بين الأغطية فتصيب من يرتب السرير لاحقًا.",
            feedbackEn: "Not right. A needle on the bed may stick the patient, or disappear into the sheets and injure whoever changes the bed later.",
          },
          {
            textAr: "أُسقطها فورًا في الحاوية التي أمامي، ثم أثبّت ذراع المريض والقنية.",
            textEn: "I drop it straight into the container in front of me, then steady the patient’s arm and the cannula.",
            isCorrect: true,
            stepKey: "immediate-disposal",
            feedbackAr:
              "صحيح. التخلص من الإبرة أولًا يحررك للتعامل مع المريض بأمان؛ فالإبرة المكشوفة في يدك والمريض يتحرك هي أخطر لحظة في الإجراء.",
            feedbackEn:
              "Correct. Getting rid of the needle first frees you to deal with the patient safely; an exposed needle in your hand while the patient moves is the riskiest moment of the procedure.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "بعد تثبيت القنية تنظر إلى الحاوية: محتواها بلغ ثلاثة أرباعها تقريبًا، وغطاؤها المؤقت مفتوح.",
        contextEn: "Once the cannula is secured you look at the container: it is about three-quarters full and its temporary lid is open.",
        promptAr: "اختر كل الإجراءات الصحيحة.",
        promptEn: "Choose all the correct actions.",
        options: [
          {
            textAr: "أهزّها قليلًا لتستقر المحتويات وتتسع لعدد أكبر.",
            textEn: "Shake it a little so the contents settle and more will fit.",
            isCorrect: false,
            stepKey: "container-fill-line",
            feedbackAr:
              "غير صحيح. هزّ الحاوية قد يُخرج أداة حادة من الفتحة أو يدفعها لتخترق الجدار، ولا يغير حقيقة أنها بلغت حد الاستبدال.",
            feedbackEn:
              "Not right. Shaking the container can push a sharp out of the opening or through the wall, and it does not change the fact that it has reached its replacement point.",
          },
          {
            textAr: "أغلقها إغلاقًا نهائيًا الآن، لأنها بلغت ثلاثة أرباعها.",
            textEn: "Lock it closed for good now, as it is three-quarters full.",
            isCorrect: true,
            stepKey: "container-fill-line",
            feedbackAr:
              "صحيح. ثلاثة أرباع السعة هي حد الاستبدال الموصى به، والإغلاق النهائي يمنع أي يد من الوصول إلى محتواها (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Three-quarters full is the recommended replacement point, and the final lock stops any hand reaching the contents (WHO).",
          },
          {
            textAr: "أستمر في استخدامها حتى تمتلئ تمامًا، ثم أغلقها.",
            textEn: "Keep using it until it is completely full, then close it.",
            isCorrect: false,
            stepKey: "container-fill-line",
            feedbackAr:
              "غير صحيح. الحاوية الممتلئة حتى حافتها يصعب إغلاقها بأمان، وكل أداة جديدة تُدخل فيها قد تدفع أخرى إلى الخارج.",
            feedbackEn:
              "Not right. A container filled to the brim is hard to close safely, and every new sharp pushed in can force another one out.",
          },
          {
            textAr: "أضع مكانها حاوية جديدة قائمة ومستقرة في متناول اليد.",
            textEn: "Put a new container in its place, upright, stable and within reach.",
            isCorrect: true,
            stepKey: "container-at-point-of-use",
            feedbackAr: "صحيح. الحاوية التالية يجب أن تكون جاهزة عند نقطة الاستخدام قبل الإجراء القادم.",
            feedbackEn: "Correct. The next container has to be ready at the point of use before the next procedure.",
          },
        ],
      },
      {
        kind: "single",
        contextAr:
          "عند السرير المجاور، ينتهي زميل من سحب عينة دم ويهمّ بإعادة الغطاء إلى الإبرة بكلتا يديه، ويقول: «حتى أحملها بأمان إلى الحاوية في الطرف الآخر».",
        contextEn:
          "At the next bed, a colleague finishes drawing a blood sample and is about to recap the needle with both hands, saying: “So I can carry it safely to the container on the other side.”",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "لا أتدخل؛ فهذه مسؤوليته، وهو ممرض ذو خبرة.",
            textEn: "I don’t step in; it is his responsibility, and he is an experienced nurse.",
            isCorrect: false,
            stepKey: "no-recap",
            feedbackAr:
              "غير صحيح. الخبرة لا تحمي من الوخز، وإعادة التغطية بكلتا اليدين خطأ شائع حتى بين ذوي الخبرة. السكوت عن ممارسة خطرة يسمح بتكرارها.",
            feedbackEn:
              "Not right. Experience does not protect against needlesticks, and two-handed recapping is common even among experienced staff. Staying silent about an unsafe practice lets it continue.",
          },
          {
            textAr: "أنصحه بأن يغطيها بيد واحدة بتقنية الغَرْف، ثم يمشي بها إلى الحاوية.",
            textEn: "I advise him to recap it one-handed with the scoop technique and then walk it to the container.",
            isCorrect: false,
            stepKey: "no-hand-carry",
            feedbackAr:
              "غير صحيح. تقنية الغَرْف أفضل من التغطية بكلتا اليدين، لكنها بديل احتياطي فقط. الحل الأفضل هنا إحضار الحاوية إليه، لا حمل الإبرة إليها.",
            feedbackEn:
              "Not right. The scoop technique beats two-handed recapping, but it is only a fallback. The better answer here is to bring the container to him, not the needle to the container.",
          },
          {
            textAr: "أوقفه بلطف، وأقرّب إليه حاويتي ليرمي الإبرة مكشوفة فورًا.",
            textEn: "I stop him politely and bring my container over so he can drop the needle in uncapped at once.",
            isCorrect: true,
            stepKey: "no-recap",
            feedbackAr:
              "صحيح. التدخل اللطيف في اللحظة المناسبة جزء من ثقافة السلامة، وتقريب الحاوية يلغي سبب إعادة التغطية من الأساس (الاحتياطات القياسية، CDC).",
            feedbackEn:
              "Correct. Stepping in kindly at the right moment is part of a safety culture, and bringing the container over removes the reason to recap in the first place (CDC Standard Precautions).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "في نهاية المناوبة، أثناء تنظيف السرير 7، تلمح إبرة مكشوفة على الأرض تحت النقالة.",
        contextEn: "At the end of the shift, while bed 7 is being cleaned, you spot an uncapped needle on the floor under the stretcher.",
        promptAr: "كيف تتعامل معها؟",
        promptEn: "How do you deal with it?",
        options: [
          {
            textAr: "ألتقطها بأصابعي بحذر، فأنا ألبس القفازات، ثم أحملها إلى الحاوية.",
            textEn: "I pick it up carefully with my fingers, since I am wearing gloves, and carry it to the container.",
            isCorrect: false,
            // MEDICAL REVIEW: proposed critical (a dropped used needle picked up with the fingers).
            isCritical: true,
            stepKey: "no-hand-carry",
            feedbackAr: "خطأ جسيم. القفاز لا يمنع الإبرة من اختراق الجلد. استخدم ملقطًا وقرّب الحاوية بدل حمل الإبرة.",
            feedbackEn: "Serious error. A glove does not stop a needle going through the skin. Use forceps and bring the container over instead of carrying the needle.",
          },
          {
            textAr: "أقرّب الحاوية منها، وألتقطها بملقط وأُسقطها في الحاوية، ثم أبلغ المسؤول عن الحادثة.",
            textEn: "I bring the container next to it, pick it up with forceps, drop it in, then report the incident to the person in charge.",
            isCorrect: true,
            feedbackAr:
              "صحيح. الأداة الحادة الملقاة تُلتقط بأداة لا باليد، وتُنقل الحاوية إليها. والإبلاغ عن «الحادثة الوشيكة» يساعد القسم على معرفة سبب سقوطها ومنع تكراره.",
            feedbackEn:
              "Correct. A dropped sharp is picked up with a tool, not by hand, and the container comes to it. Reporting the near miss helps the unit find out why it was dropped and stop it happening again.",
          },
          {
            textAr: "أكنسها بورقة إلى كيس النفايات العامة.",
            textEn: "I sweep it with a sheet of paper into the general waste bag.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr: "غير صحيح. الإبرة في كيس النفايات العامة ستصيب عامل النقل أو عامل الفرز. مكانها الوحيد حاوية الأدوات الحادة.",
            feedbackEn: "Not right. A needle in a general waste bag will injure the porter or the waste handler. Its only place is a sharps container.",
          },
          {
            textAr: "أترك ملاحظة لفريق النظافة ليتعامل معها.",
            textEn: "I leave a note for the cleaning team to deal with it.",
            isCorrect: false,
            stepKey: "immediate-disposal",
            feedbackAr: "غير صحيح. ترك الإبرة مكانها يُبقي الخطر قائمًا على كل من يمر، والملاحظة قد لا تُقرأ في الوقت المناسب.",
            feedbackEn: "Not right. Leaving the needle where it is keeps the danger there for everyone who passes, and the note may not be read in time.",
          },
        ],
      },
    ],
  },

  // 3 ── blood and body-fluid spills (core) ─────────────────────────────────────────────────────────
  {
    slug: "blood-spill-patient-room",
    protocolSlug: "blood-spill-management",
    titleAr: "انسكاب دم في غرفة مريضة",
    titleEn: "A blood spill in a patient’s room",
    introAr: "انكسر أنبوب عينة دم على أرضية غرفة مريضة. احمِ الآخرين ونفسك، والتقط الزجاج بأمان، ثم نظّف وطهّر حتى لا يبقى أثر.",
    introEn: "A blood sample tube has broken on the floor of a patient’s room. Protect others and yourself, pick up the glass safely, then clean and disinfect until nothing is left.",
    settingAr:
      "مستشفى عام في الدمام، قسم الجراحة العامة للنساء، الغرفة 308، الساعة الرابعة عصرًا. سقط أنبوب عينة دم زجاجي من صينية زميلة فانكسر على الأرض قرب السرير، وتشكّلت بقعة دم بحجم كف اليد تقريبًا بين شظايا الزجاج. المريضة في سريرها، وابنتها في زيارتها.",
    settingEn:
      "A general hospital in Dammam, women’s general surgery ward, room 308, 4 p.m. A glass blood sample tube fell from a colleague’s tray and broke on the floor near the bed, leaving a palm-sized pool of blood among the glass shards. The patient is in bed and her daughter is visiting.",
    difficulty: "beginner",
    estimatedMinutes: 7,
    stages: [
      {
        kind: "single",
        contextAr: "تدخل الغرفة فتجد ابنة المريضة تتجه نحو مكان الانسكاب لتساعد في جمع الزجاج.",
        contextEn: "You walk in and find the patient’s daughter heading towards the spill to help pick up the glass.",
        promptAr: "ما أول ما تفعله؟",
        promptEn: "What is the first thing you do?",
        options: [
          {
            textAr: "أشكرها، وأتركها تجمع القطع الكبيرة بمنديل بينما أُحضر عدة الانسكاب.",
            textEn: "I thank her and let her gather the large pieces with a tissue while I fetch the spill kit.",
            isCorrect: false,
            stepKey: "warn-others",
            feedbackAr:
              "غير صحيح. الزائرة لا تلبس أي وقاية، وقد يجرحها زجاج ملوث بالدم. التعامل مع الانسكاب مسؤولية العاملين المدرَّبين فقط.",
            feedbackEn:
              "Not right. The visitor has no protection and could be cut by blood-contaminated glass. Dealing with a spill is a job for trained staff only.",
          },
          {
            textAr: "أطلب منها بهدوء أن تبتعد، وأنبّه من في الغرفة إلى عدم الاقتراب حتى ينتهي التنظيف.",
            textEn: "I calmly ask her to step back and warn everyone in the room not to come near until the clean-up is done.",
            isCorrect: true,
            stepKey: "warn-others",
            feedbackAr:
              "صحيح. إبعاد المرضى والزوار أولًا يمنع أن يطؤوا الانسكاب أو يجرحهم الزجاج أو ينقلوا التلوث إلى أماكن أخرى (إرشادات CDC لمكافحة العدوى البيئية).",
            feedbackEn:
              "Correct. Keeping patients and visitors away first stops them stepping in the spill, being cut by the glass or spreading the contamination (CDC environmental infection control guidelines).",
          },
          {
            textAr: "أبدأ بمسح الدم فورًا بمناديل ورقية قبل أن ينتشر.",
            textEn: "I start wiping the blood straight away with paper towels before it spreads.",
            isCorrect: false,
            isCritical: true,
            stepKey: "wear-ppe",
            feedbackAr:
              "خطأ جسيم. لمس الانسكاب دون قفازات يعرّضك مباشرة للدم، ومسحه والزجاج فيه قد يجرح يدك. احمِ من حولك ونفسك أولًا.",
            feedbackEn:
              "Serious error. Touching the spill without gloves exposes you directly to the blood, and wiping it with glass in it can cut your hand. Protect the people around you and yourself first.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "أبعدت الزوار وأحضرت عدة الانسكاب. ستعمل قريبًا من الأرض بين شظايا الزجاج.",
        contextEn: "You have moved the visitors away and brought the spill kit. You will be working close to the floor among the glass shards.",
        promptAr: "اختر كل ما يصح قبل أن تلمس الانسكاب.",
        promptEn: "Choose everything that is right before you touch the spill.",
        options: [
          {
            textAr: "أنظّف يديّ، ثم ألبس قفازات طبية جديدة للاستخدام مرة واحدة.",
            textEn: "Clean my hands, then put on new single-use medical gloves.",
            isCorrect: true,
            stepKey: "wear-ppe",
            feedbackAr: "صحيح. القفازات أساس الحماية من الدم الذي قد يحمل فيروسات التهاب الكبد ونقص المناعة (الاحتياطات القياسية، CDC).",
            feedbackEn: "Correct. Gloves are the basic barrier against blood, which may carry hepatitis viruses and HIV (CDC Standard Precautions).",
          },
          {
            textAr: "أبقي القفازات نفسها التي لبستها عند المريضة السابقة، فما زالت سليمة.",
            textEn: "Keep the same gloves I wore for the previous patient, since they are still intact.",
            isCorrect: false,
            stepKey: "wear-ppe",
            feedbackAr:
              "غير صحيح. القفازات المستعملة ملوثة بما لمسته من قبل، ولا تُنقل من مهمة إلى أخرى. نظّف يديك والبس زوجًا جديدًا.",
            feedbackEn:
              "Not right. Used gloves are contaminated with whatever you touched before and are never carried over to another task. Clean your hands and put on a fresh pair.",
          },
          {
            // MEDICAL REVIEW: an apron for a small floor spill follows common hospital spill policies; left unmapped
            // so forgetting it is explained without counting as a (critical) PPE violation.
            textAr: "ألبس مئزرًا بلاستيكيًا للاستخدام مرة واحدة، لأنني سأعمل قريبًا من الانسكاب.",
            textEn: "Put on a single-use plastic apron, since I will be working close to the spill.",
            isCorrect: true,
            feedbackAr: "صحيح. ستعمل جاثيًا قرب الدم والزجاج، والمئزر يحمي ملابسك من التلوث، كما تنص معظم سياسات الانسكاب في المستشفيات.",
            feedbackEn: "Correct. You will be kneeling near the blood and glass, and an apron keeps your uniform clean, as most hospital spill policies require.",
          },
          {
            textAr: "لا حاجة إلى قفازات ما دمت سأستخدم الملقط والمجرفة فقط.",
            textEn: "No gloves are needed as long as I only use the tongs and the scoop.",
            isCorrect: false,
            isCritical: true,
            stepKey: "wear-ppe",
            feedbackAr:
              "خطأ جسيم. الأدوات تقلل اللمس لكنها لا تمنعه؛ فالرذاذ وأطراف المناديل والأدوات نفسها ملوثة. لا يُلمس أي انسكاب دم دون قفازات.",
            feedbackEn:
              "Serious error. Tools reduce contact but do not prevent it: splashes, towel edges and the tools themselves are contaminated. Never deal with a blood spill without gloves.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "لبست الوقاية المناسبة. بين الدم شظايا زجاج كبيرة وصغيرة.",
        contextEn: "You have your protection on. There are large and small glass shards in the blood.",
        promptAr: "كيف تزيل الزجاج؟",
        promptEn: "How do you remove the glass?",
        options: [
          {
            textAr: "ألتقط القطع الكبيرة بيدي بحذر، فالقفازات تحميني.",
            textEn: "I carefully pick up the large pieces by hand, since the gloves protect me.",
            isCorrect: false,
            // MEDICAL REVIEW: the protocol leaves sharps-in-spill non-critical until the medical members agree.
            stepKey: "sharps-in-spill",
            feedbackAr:
              "غير صحيح. الزجاج يقطع القفاز بسهولة، والجرح الملوث بالدم يعرّضك للعدوى. يُمنع التقاط الزجاج المكسور باليد مباشرة (معيار OSHA للعوامل الممرضة المنقولة بالدم).",
            feedbackEn:
              "Not right. Glass cuts through gloves easily, and a blood-contaminated cut exposes you to infection. Broken glass must never be picked up directly by hand (OSHA Bloodborne Pathogens Standard).",
          },
          {
            textAr: "أمسح الدم والزجاج معًا بالمناديل الورقية، وأرمي الكل في كيس النفايات.",
            textEn: "I wipe up the blood and glass together with paper towels and throw it all into a waste bag.",
            isCorrect: false,
            stepKey: "sharps-in-spill",
            feedbackAr:
              "غير صحيح. مسح الزجاج بالمناديل يجرح اليد بسهولة، والزجاج في كيس النفايات قد يخترقه ويجرح من يحمله. أزل الزجاج أولًا بأداة إلى حاوية الأدوات الحادة.",
            feedbackEn:
              "Not right. Wiping glass with towels cuts hands easily, and glass in a waste bag can pierce it and injure whoever carries it. Remove the glass first, with a tool, into a sharps container.",
          },
          {
            textAr: "أستخدم الملقط أو المجرفة والفرشاة من عدة الانسكاب، وأضع الزجاج في حاوية الأدوات الحادة.",
            textEn: "I use the tongs, or the scoop and brush, from the spill kit and put the glass into a sharps container.",
            isCorrect: true,
            stepKey: "sharps-in-spill",
            feedbackAr:
              "صحيح. الأدوات تُبعد يدك عن الحواف الحادة، وحاوية الأدوات الحادة تمنع الزجاج من جرح عمال النفايات لاحقًا.",
            feedbackEn: "Correct. The tools keep your hands away from the sharp edges, and the sharps container stops the glass injuring waste handlers later.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "أزلت الزجاج كله، وبقيت بقعة الدم على الأرضية.",
        contextEn: "All the glass is gone. The pool of blood remains on the floor.",
        promptAr: "اختر كل الخطوات الصحيحة للتعامل مع الدم.",
        promptEn: "Choose all the correct steps for dealing with the blood.",
        options: [
          {
            textAr: "أرشّ المطهر على الدم وأمسحه فورًا.",
            textEn: "Spray disinfectant on the blood and wipe it off immediately.",
            isCorrect: false,
            stepKey: "clean-then-disinfect",
            feedbackAr:
              "غير صحيح. المطهر فوق الدم تضعفه المادة العضوية، والمسح الفوري لا يترك له مدة التلامس اللازمة، فتبقى الميكروبات حية.",
            feedbackEn:
              "Not right. Disinfectant sprayed on blood is weakened by the organic material, and wiping it off at once leaves no contact time, so microorganisms survive.",
          },
          {
            textAr: "أغطي البقعة بمادة ماصة (مناديل ورقية أو حبيبات عدة الانسكاب) لاحتوائها.",
            textEn: "Cover the pool with absorbent material (paper towels or the spill kit’s granules) to contain it.",
            isCorrect: true,
            stepKey: "contain-absorb",
            feedbackAr: "صحيح. الاحتواء يمنع السائل من الانتشار ويقلل الرذاذ أثناء الإزالة.",
            feedbackEn: "Correct. Containment stops the fluid spreading and reduces splashing while you remove it.",
          },
          {
            textAr: "أنظف المكان بممسحة الأرضيات العامة في القسم.",
            textEn: "Clean the area with the ward’s general floor mop.",
            isCorrect: false,
            stepKey: "clean-then-disinfect",
            feedbackAr:
              "غير صحيح. الممسحة المشتركة تنشر الدم إلى بقية القسم ويصعب تنظيفها بعد ذلك. استخدم مواد الاستخدام مرة واحدة من عدة الانسكاب.",
            feedbackEn: "Not right. A shared mop spreads the blood around the ward and is hard to clean afterwards. Use the single-use materials in the spill kit.",
          },
          {
            textAr: "أزيل المادة الماصة والدم، ثم أطهّر المكان بالمطهر المعتمد وأتركه رطبًا طوال مدة التلامس المحددة.",
            textEn: "Remove the absorbent and the blood, then disinfect the area with the approved disinfectant and leave it wet for the full contact time.",
            isCorrect: true,
            stepKey: "clean-then-disinfect",
            feedbackAr:
              "صحيح. المادة العضوية تضعف المطهر، لذلك تُزال أولًا، ثم يحتاج المطهر إلى مدة التلامس التي تحددها سياسة منشأتك ليقتل الميكروبات (CDC).",
            feedbackEn:
              "Correct. Organic material weakens disinfectants, so it comes off first; the disinfectant then needs the contact time your facility’s policy sets to kill microorganisms (CDC).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "انتهيت من التطهير. بين يديك مناديل ملوثة ومجرفة للاستخدام مرة واحدة، وما زلت تلبس القفازات والمئزر.",
        contextEn: "You have finished disinfecting. You are holding soiled towels and a single-use scoop, and you are still wearing gloves and the apron.",
        promptAr: "ماذا تفعل الآن؟",
        promptEn: "What do you do now?",
        options: [
          {
            textAr: "أرميها في سلة النفايات العامة في الغرفة لأن كميتها قليلة.",
            textEn: "I throw them in the room’s general waste bin, since there is only a little.",
            isCorrect: false,
            stepKey: "dispose-and-hand-hygiene",
            feedbackAr:
              "غير صحيح. الكمية لا تغير التصنيف: كل ما تلوث بالدم يذهب إلى النفايات المعدية حسب نظام منشأتك، لا إلى النفايات العامة.",
            feedbackEn:
              "Not right. The amount does not change the category: anything soiled with blood goes into infectious waste under your facility’s system, not general waste.",
          },
          {
            textAr: "أضع المواد الملوثة في كيس النفايات المعدية، ثم أخلع القفازات والمئزر، وأنظف يديّ.",
            textEn: "I put the soiled materials into the infectious-waste bag, take off the gloves and apron, then clean my hands.",
            isCorrect: true,
            stepKey: "dispose-and-hand-hygiene",
            feedbackAr:
              "صحيح. المواد الملوثة بالدم نفايات معدية، وتنظيف اليدين بعد خلع القفازات ضروري دائمًا لأن القفاز قد يتلوث أو يتمزق دون أن تلاحظ (منظمة الصحة العالمية).",
            feedbackEn:
              "Correct. Blood-soiled materials are infectious waste, and hand hygiene after removing gloves is always needed, because gloves can be contaminated or torn without you noticing (WHO).",
          },
          {
            textAr: "أخلع القفازات وأذهب مباشرة إلى المريضة التالية، فيداي كانتا محميتين.",
            textEn: "I take off the gloves and go straight to the next patient; my hands were protected.",
            isCorrect: false,
            stepKey: "dispose-and-hand-hygiene",
            feedbackAr: "غير صحيح. القفازات لا تغني عن نظافة اليدين؛ فقد تتلوث يداك أثناء خلع القفازات نفسها، فنظّفهما دائمًا بعدها.",
            feedbackEn: "Not right. Gloves never replace hand hygiene. Your hands can be contaminated while taking the gloves off, so always clean them afterwards.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "قبل أن تغادر الغرفة تلقي نظرة أخيرة.",
        contextEn: "Before you leave the room you take a last look.",
        promptAr: "اختر كل ما يجب فعله قبل أن تغادر.",
        promptEn: "Choose everything you should do before you leave.",
        options: [
          {
            textAr: "أتأكد أنه لم يبقَ أثر ظاهر للدم على الأرضية أو أرجل السرير أو الجدار القريب.",
            textEn: "Check that no visible blood is left on the floor, the bed legs or the nearby wall.",
            isCorrect: true,
            stepKey: "no-visible-blood",
            feedbackAr: "صحيح. البقع الصغيرة على أرجل السرير أو الجدار تُنسى كثيرًا، وهي مصدر تعرض مباشر للعاملين والمرضى والزوار.",
            feedbackEn: "Correct. Small stains on bed legs or the wall are often missed, and they are a direct exposure source for staff, patients and visitors.",
          },
          {
            textAr: "أترك نقطتين صغيرتين جافتين على الأرض، فقد طُهّرتا ولا خطر منهما.",
            textEn: "Leave two small dried spots on the floor; they were disinfected, so they are harmless.",
            isCorrect: false,
            stepKey: "no-visible-blood",
            feedbackAr:
              "غير صحيح. أي أثر ظاهر للدم يعني أن التنظيف لم يكتمل، ولا يستطيع غيرك أن يعرف أنه طُهّر. أكمل حتى لا يبقى أثر.",
            feedbackEn: "Not right. Any visible blood means the clean-up is not finished, and nobody else can tell it was disinfected. Keep going until nothing is left.",
          },
          {
            textAr: "أبلغ عن استخدام عدة الانسكاب ليُعاد تزويدها بما نقص منها.",
            textEn: "Report that the spill kit was used so it can be restocked.",
            isCorrect: true,
            stepKey: "spill-kit-available",
            feedbackAr: "صحيح. عدة الانسكاب الناقصة تؤخر التعامل مع الانسكاب القادم وتشجع على التنظيف دون حماية.",
            feedbackEn: "Correct. An incomplete spill kit delays the next clean-up and encourages cleaning without protection.",
          },
          {
            textAr: "أسمح للزوار بالعودة إلى مكان الانسكاب بعد أن تجف الأرضية تمامًا.",
            textEn: "Let visitors back into the spill area once the floor is completely dry.",
            isCorrect: true,
            stepKey: "warn-others",
            feedbackAr: "صحيح. الأرضية المبتلة بالمطهر قد تسبب الانزلاق، وعودة الزوار بعد جفافها تُنهي عزل المكان بأمان.",
            feedbackEn: "Correct. A floor wet with disinfectant can cause a fall; letting visitors back once it is dry ends the cordon safely.",
          },
        ],
      },
    ],
  },

  // 4 ── blood and body-fluid spills ────────────────────────────────────────────────────────────────
  {
    slug: "blood-spill-emergency-corridor",
    protocolSlug: "blood-spill-management",
    titleAr: "انسكاب دم كبير في ممر الطوارئ",
    titleEn: "A large blood spill in the emergency corridor",
    introAr: "تمزق كيس تصريف أثناء نقل مريض: انسكاب كبير في ممر مزدحم، وعدة انسكاب ناقصة، ورذاذ على الجدار.",
    introEn: "A drainage bag bursts while a patient is being moved: a large spill in a busy corridor, an incomplete spill kit and splashes on the wall.",
    settingAr:
      "قسم الطوارئ في مستشفى مركزي بأبها، الساعة الحادية عشرة ليلًا. أثناء نقل مريض على نقالة تمزق كيس تصريف مملوء بالدم والسوائل، فانسكب نحو نصف لتر على أرضية الممر، وتناثر رذاذ على الجدار بمستوى الكتف، ووصلت قطرات إلى فراش النقالة. أنت ممرض الطوارئ الأقرب.",
    settingEn:
      "The emergency department of a central hospital in Abha, 11 p.m. While a patient was being moved on a stretcher, a drainage bag full of blood and fluid burst: about half a litre spilled onto the corridor floor, splashes reached the wall at shoulder height and drops landed on the stretcher mattress. You are the nearest emergency nurse.",
    difficulty: "advanced",
    estimatedMinutes: 8,
    stages: [
      {
        kind: "single",
        contextAr: "الممر مزدحم بالمرضى والمرافقين، وبعضهم يمر بجانب الانسكاب.",
        contextEn: "The corridor is crowded with patients and companions, and some are walking right past the spill.",
        promptAr: "ما أول إجراء تتخذه؟",
        promptEn: "What is your first action?",
        options: [
          {
            textAr: "أطلب من أحد المرافقين الوقوف عند الانسكاب لينبّه الناس حتى أعود.",
            textEn: "I ask one of the companions to stand by the spill and warn people until I come back.",
            isCorrect: false,
            stepKey: "warn-others",
            feedbackAr: "غير صحيح. لا يُكلَّف زائر بحراسة انسكاب دم؛ فهو غير محمي وقد يتعرض له. التنبيه والعزل مسؤولية الفريق.",
            feedbackEn: "Not right. A visitor is never asked to guard a blood spill; they have no protection and may be exposed. Warning and cordoning are the team’s job.",
          },
          {
            textAr: "لا داعي لشيء خاص؛ الناس سيرون الدم ويتجنبونه.",
            textEn: "Nothing special is needed; people will see the blood and avoid it.",
            isCorrect: false,
            stepKey: "warn-others",
            feedbackAr: "غير صحيح. في ممر مزدحم ليلًا لن يرى الجميع الانسكاب، والأرضية الزلقة بالدم خطر انزلاق وتعرض في آن واحد.",
            feedbackEn: "Not right. In a crowded corridor at night not everyone will see the spill, and a floor slick with blood is a fall and an exposure risk at once.",
          },
          {
            textAr: "أضع لافتة تحذير، وأطلب من زميل توجيه المارة إلى ممر آخر حتى ينتهي التنظيف.",
            textEn: "I put out a warning sign and ask a colleague to redirect people to another corridor until the clean-up is finished.",
            isCorrect: true,
            stepKey: "warn-others",
            feedbackAr: "صحيح. في الانسكاب الكبير في مكان مزدحم، عزل المكان أولًا يمنع الانزلاق ويمنع انتقال الدم بالأحذية إلى أنحاء القسم.",
            feedbackEn: "Correct. With a large spill in a busy place, cordoning it off first prevents falls and stops shoes tracking blood around the department.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "تفتح خزانة عدة الانسكاب في الطوارئ فتجدها ناقصة: لا حبيبات ماصة ولا مجرفة.",
        contextEn: "You open the emergency department’s spill kit cupboard and find the kit incomplete: no absorbent granules and no scoop.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أحضر عدة مكتملة من القسم المجاور، وأبلغ المسؤول بأن عدة الطوارئ تحتاج إلى إعادة تزويد.",
            textEn: "I get a complete kit from the neighbouring unit and tell the person in charge that the emergency kit needs restocking.",
            isCorrect: true,
            stepKey: "spill-kit-available",
            feedbackAr: "صحيح. العدة المكتملة تتيح التعامل الصحيح الآن، والإبلاغ يضمن ألا يواجه زميلك الموقف نفسه في الانسكاب القادم.",
            feedbackEn: "Correct. A complete kit lets you do the job properly now, and reporting it means a colleague does not face the same problem at the next spill.",
          },
          {
            textAr: "أستخدم ما يتوفر من مناشف القماش في غرفة الضمادات بدلًا منها.",
            textEn: "I use whatever cloth towels are in the dressing room instead.",
            isCorrect: false,
            stepKey: "spill-kit-available",
            feedbackAr: "غير صحيح. مناشف القماش لا تمتص بكفاءة، وتعود إلى المغسلة ملوثة بالدم. البديل الصحيح عدة انسكاب مكتملة من أقرب قسم.",
            feedbackEn:
              "Not right. Cloth towels do not absorb well and go back to the laundry soaked in blood. The right alternative is a complete kit from the nearest unit.",
          },
          {
            textAr: "أغطي الانسكاب بملاءة، وأترك تنظيفه لفريق النظافة الصباحي.",
            textEn: "I cover the spill with a sheet and leave the clean-up to the morning cleaning team.",
            isCorrect: false,
            stepKey: "no-visible-blood",
            feedbackAr: "غير صحيح. الانسكاب يُعالج فورًا لا بعد ساعات؛ فالملاءة لا تمنع الانزلاق ولا التعرض، والدم يجف فيصعب تنظيفه.",
            feedbackEn: "Not right. A spill is dealt with at once, not hours later. A sheet prevents neither falls nor exposure, and the blood dries and gets harder to clean.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "ستنظف أرضية الممر والجدار الذي تناثر عليه الرذاذ بمستوى الكتف، وقد يتطاير رذاذ أثناء العمل.",
        contextEn: "You will clean the corridor floor and the wall splashed at shoulder height, and splashes may fly while you work.",
        promptAr: "اختر كل وسائل الوقاية التي تلبسها.",
        promptEn: "Choose all the protective equipment you put on.",
        options: [
          {
            textAr: "قفازات للاستخدام مرة واحدة.",
            textEn: "Single-use gloves.",
            isCorrect: true,
            stepKey: "wear-ppe",
            feedbackAr: "صحيح. القفازات حماية أساسية في كل تعامل مع الدم (الاحتياطات القياسية، CDC).",
            feedbackEn: "Correct. Gloves are basic protection whenever you handle blood (CDC Standard Precautions).",
          },
          {
            textAr: "القفازات وحدها تكفي في كل الانسكابات.",
            textEn: "Gloves alone are enough for every spill.",
            isCorrect: false,
            stepKey: "wear-ppe",
            feedbackAr:
              "غير صحيح. القفازات تحمي اليدين فقط. حين يُحتمل الرذاذ يلزم المئزر وواقي العين أيضًا، وهذا الانسكاب كبير ويمتد إلى مستوى الوجه.",
            feedbackEn:
              "Not right. Gloves protect only your hands. When splashing is possible you also need an apron and eye protection, and this spill is large and reaches face level.",
          },
          {
            textAr: "مئزر أو رداء مقاوم للسوائل.",
            textEn: "A fluid-resistant apron or gown.",
            isCorrect: true,
            stepKey: "wear-ppe",
            feedbackAr: "صحيح. مع نصف لتر من السوائل والعمل على الأرضية والجدار، يحمي المئزر أو الرداء جسمك وملابسك من التلوث.",
            feedbackEn: "Correct. With half a litre of fluid and work on both floor and wall, an apron or gown protects your body and clothes from contamination.",
          },
          {
            textAr: "واقي عين أو واقي وجه.",
            textEn: "Eye protection or a face shield.",
            isCorrect: true,
            stepKey: "wear-ppe",
            feedbackAr: "صحيح. العمل على جدار بمستوى الوجه مع احتمال الرذاذ يعرّض العينين والأغشية المخاطية للدم، وهي منفذ للعدوى.",
            feedbackEn: "Correct. Working on a wall at face level where splashes are possible exposes your eyes and mucous membranes, which are entry points for infection.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "تبدأ بالأرضية: الانسكاب كبير وما زال سائلًا.",
        contextEn: "You start with the floor: the spill is large and still liquid.",
        promptAr: "كيف تتعامل مع هذا الانسكاب الكبير؟",
        promptEn: "How do you handle this large spill?",
        options: [
          {
            textAr: "أدفع السائل بالممسحة نحو مصرف الأرضية لأتخلص منه بسرعة.",
            textEn: "I push the fluid with a mop towards the floor drain to get rid of it fast.",
            isCorrect: false,
            stepKey: "contain-absorb",
            feedbackAr: "غير صحيح. دفع الدم بالممسحة ينشره على مساحة أكبر ويزيد الرذاذ، ويلوث الممسحة والمصرف.",
            feedbackEn: "Not right. Pushing blood with a mop spreads it over a larger area, adds splashes and contaminates the mop and the drain.",
          },
          {
            textAr: "أغطيه بالحبيبات أو المادة الماصة من العدة لأحتويه، ثم أتبع إجراء الانسكابات الكبيرة في منشأتي.",
            textEn: "I cover it with the kit’s granules or absorbent to contain it, then follow my facility’s large-spill procedure.",
            isCorrect: true,
            stepKey: "contain-absorb",
            feedbackAr:
              "صحيح. الاحتواء أولًا يمنع انتشار السائل. وفي الانسكاب الكبير يُصب المطهر على المادة الماصة ويُترك مدة التلامس قبل إزالتها، ثم يُنظف المكان ويُطهّر مرة أخرى حسب إجراء المنشأة.",
            feedbackEn:
              "Correct. Containing it first stops the fluid spreading. For a large spill, disinfectant goes onto the absorbent and is left for the contact time before removal; the area is then cleaned and disinfected again, following your facility’s procedure.",
          },
          {
            textAr: "أمسحه على دفعات بمنشفة ورقية كبيرة واحدة.",
            textEn: "I wipe it up in batches with one large paper towel.",
            isCorrect: false,
            stepKey: "contain-absorb",
            feedbackAr: "غير صحيح. منشفة واحدة لا تكفي لنصف لتر، والمسح على دفعات ينشر الدم بدل احتوائه. ابدأ بتغطيته بالمادة الماصة.",
            feedbackEn: "Not right. One towel is not enough for half a litre, and wiping in batches spreads the blood instead of containing it. Start by covering it with absorbent.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "انتهيت من الأرضية. على فراش النقالة بقع دم صغيرة، والمريض التالي ينتظرها.",
        contextEn: "The floor is done. There are small blood stains on the stretcher mattress, and the next patient is waiting for it.",
        promptAr: "ماذا تفعل بالنقالة؟",
        promptEn: "What do you do with the stretcher?",
        options: [
          {
            textAr: "أغطي البقع بملاءة نظيفة جديدة، وأستخدم النقالة.",
            textEn: "I cover the stains with a fresh clean sheet and use the stretcher.",
            isCorrect: false,
            stepKey: "no-visible-blood",
            feedbackAr: "غير صحيح. الملاءة تخفي الدم ولا تزيله، فينتقل التلوث إلى المريض التالي وإلى من ينقله.",
            feedbackEn: "Not right. A sheet hides the blood without removing it, so the contamination reaches the next patient and whoever moves him.",
          },
          {
            textAr: "أمسح البقع مسحة واحدة سريعة بمنديل مطهر، وأرسل النقالة فورًا.",
            textEn: "I give the stains one quick wipe with a disinfectant wipe and send the stretcher straight off.",
            isCorrect: false,
            stepKey: "clean-then-disinfect",
            feedbackAr: "غير صحيح. مسحة واحدة سريعة لا تزيل المادة العضوية، ولا تترك للمطهر مدة التلامس اللازمة.",
            feedbackEn: "Not right. One quick wipe neither removes the organic material nor gives the disinfectant its contact time.",
          },
          {
            textAr: "أزيل الدم بمناديل للاستخدام مرة واحدة، ثم أطهّر الفراش بالمطهر المعتمد وأتركه مدة التلامس قبل استخدامه.",
            textEn: "I remove the blood with single-use towels, then disinfect the mattress with the approved disinfectant and leave it for the contact time before it is used.",
            isCorrect: true,
            feedbackAr: "صحيح. التنظيف ثم التطهير بمدة التلامس الكاملة هو ما يجعل النقالة آمنة للمريض التالي (CDC).",
            feedbackEn: "Correct. Cleaning, then disinfecting for the full contact time, is what makes the stretcher safe for the next patient (CDC).",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "انتهيت من الممر والجدار والنقالة.",
        contextEn: "You have finished the corridor, the wall and the stretcher.",
        promptAr: "اختر كل ما يجب فعله لإنهاء المهمة.",
        promptEn: "Choose everything you should do to finish the job.",
        options: [
          {
            textAr: "أضع كل المواد الملوثة ووسائل الوقاية المستعملة في كيس النفايات المعدية.",
            textEn: "Put all soiled materials and used protective equipment into the infectious-waste bag.",
            isCorrect: true,
            stepKey: "dispose-and-hand-hygiene",
            feedbackAr: "صحيح. كل ما تلوث بالدم نفايات معدية حسب نظام الألوان في منشأتك.",
            feedbackEn: "Correct. Everything soiled with blood is infectious waste under your facility’s colour code.",
          },
          {
            textAr: "أعيد رأس الممسحة الذي لامس الدم لأستخدمه في تنظيف بقية الممرات.",
            textEn: "Put the mop head that touched the blood back into use for the other corridors.",
            isCorrect: false,
            stepKey: "clean-then-disinfect",
            feedbackAr: "غير صحيح. رأس الممسحة الذي لامس الدم ينقل التلوث إلى كل ممر يُمسح به، ويُرسل للغسيل أو يُتخلص منه حسب سياسة المنشأة.",
            feedbackEn:
              "Not right. A mop head that touched blood carries the contamination into every corridor it cleans; it goes to the laundry or is discarded, as your facility’s policy says.",
          },
          {
            textAr: "أنظف يديّ فور خلع القفازات.",
            textEn: "Clean my hands as soon as I take off the gloves.",
            isCorrect: true,
            stepKey: "dispose-and-hand-hygiene",
            feedbackAr: "صحيح. نظافة اليدين بعد خلع القفازات خطوة لا تُترك أبدًا (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Hand hygiene after removing gloves is never skipped (WHO).",
          },
          {
            textAr: "أتفقد الجدار والأرضية وأرجل النقالة للتأكد من عدم بقاء أي أثر ظاهر للدم.",
            textEn: "Check the wall, the floor and the stretcher legs to make sure no visible blood is left.",
            isCorrect: true,
            stepKey: "no-visible-blood",
            feedbackAr: "صحيح. في الانسكاب الكبير تتناثر قطرات بعيدًا عن البقعة الأساسية، والفحص الأخير يكشفها.",
            feedbackEn: "Correct. A large spill throws drops well beyond the main pool, and a final check catches them.",
          },
          {
            textAr: "أرمي المناديل الملوثة في سلة النفايات العامة القريبة لأوفّر الوقت.",
            textEn: "Throw the soiled towels into the nearby general waste bin to save time.",
            isCorrect: false,
            stepKey: "dispose-and-hand-hygiene",
            feedbackAr: "غير صحيح. المناديل المشبعة بالدم في النفايات العامة تعرّض عمال النظافة والنقل للتلوث.",
            feedbackEn: "Not right. Blood-soaked towels in general waste expose cleaners and porters to contamination.",
          },
        ],
      },
    ],
  },

  // 5 ── healthcare waste ───────────────────────────────────────────────────────────────────────────
  {
    slug: "dressing-round-waste",
    protocolSlug: "waste-management",
    titleAr: "نفايات جولة تغيير الضمادات",
    titleEn: "Waste from a dressing round",
    introAr: "في نهاية جولة الضمادات، افرز النفايات عند مصدرها، واعرف متى يُغلق الكيس، وكيف يصل إلى مكانه الصحيح.",
    introEn: "At the end of a dressing round, segregate waste at the source, know when a bag is closed and how it reaches the right place.",
    settingAr:
      "مستشفى تعليمي في سكاكا بمنطقة الجوف، جناح الجراحة، الساعة العاشرة صباحًا. انتهيت لتوّك من تغيير ضمادات أربعة مرضى، وعلى عربة الضمادات خليط من المخلفات. نظام الألوان المعتمد في منشأتك معلّق على الحائط.",
    settingEn:
      "A teaching hospital in Sakaka, Al-Jouf, surgical ward, 10 a.m. You have just changed the dressings of four patients, and the dressing trolley holds a mix of waste. Your facility’s colour-code chart is on the wall.",
    difficulty: "beginner",
    estimatedMinutes: 6,
    stages: [
      {
        kind: "multi",
        contextAr:
          "على العربة: شاش مشبع بالدم وإفرازات الجرح، وقفازات مستعملة ملوثة بالإفرازات، وأغلفة ورقية لعُدد الضمادات المعقمة، وقارورة محلول ملحي فارغة لم تلامس المريض.",
        contextEn:
          "On the trolley: gauze soaked with blood and wound fluid, used gloves soiled with wound fluid, the paper wrappers of the sterile dressing packs, and an empty saline bottle that never touched the patient.",
        promptAr: "اختر كل ما يذهب إلى كيس النفايات المعدية.",
        promptEn: "Choose everything that goes into the infectious-waste bag.",
        options: [
          {
            textAr: "الشاش المشبع بالدم وإفرازات الجرح.",
            textEn: "The gauze soaked with blood and wound fluid.",
            isCorrect: true,
            stepKey: "segregation",
            feedbackAr: "صحيح. المواد الملوثة بالدم أو سوائل الجسم نفايات معدية، تُفرز في حاويتها المخصصة عند مكان إنتاجها (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Items soiled with blood or body fluids are infectious waste and are segregated into their own container where they are produced (WHO).",
          },
          {
            textAr: "الأغلفة الورقية لعُدد الضمادات المعقمة.",
            textEn: "The paper wrappers of the sterile dressing packs.",
            isCorrect: false,
            stepKey: "segregation",
            feedbackAr: "غير صحيح. الأغلفة النظيفة نفايات عامة، ووضعها في الكيس المعدي يرفع تكلفة المعالجة بلا داعٍ ويملأ الكيس أسرع.",
            feedbackEn: "Not right. Clean wrappers are general waste. Putting them in the infectious bag raises treatment costs for nothing and fills the bag faster.",
          },
          {
            textAr: "القفازات المستعملة الملوثة بالإفرازات.",
            textEn: "The used gloves soiled with wound fluid.",
            isCorrect: true,
            stepKey: "segregation",
            feedbackAr: "صحيح. القفازات الملوثة بالإفرازات تحمل الميكروبات نفسها التي على الضمادة.",
            feedbackEn: "Correct. Gloves soiled with wound fluid carry the same microorganisms as the dressing.",
          },
          {
            textAr: "قارورة المحلول الملحي الفارغة التي لم تلامس المريض.",
            textEn: "The empty saline bottle that never touched the patient.",
            isCorrect: false,
            stepKey: "segregation",
            feedbackAr: "غير صحيح. القارورة غير الملوثة نفايات عامة، أو تذهب لإعادة التدوير إن كان في منشأتك برنامج لذلك.",
            feedbackEn: "Not right. An uncontaminated bottle is general waste, or goes for recycling if your facility has a programme for it.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "تحت الشاش تجد شفرة مشرط مستعملة من إحدى العُدد.",
        contextEn: "Under the gauze you find a used scalpel blade from one of the packs.",
        promptAr: "أين تضع الشفرة؟",
        promptEn: "Where does the blade go?",
        options: [
          {
            textAr: "في كيس النفايات المعدية بعد لفّها بالشاش.",
            textEn: "Into the infectious-waste bag, wrapped in gauze.",
            isCorrect: false,
            stepKey: "segregation",
            feedbackAr: "غير صحيح. الشاش لا يمنع الشفرة من اختراق الكيس وجرح من يحمله. الأدوات الحادة تيار نفايات مستقل.",
            feedbackEn: "Not right. Gauze does not stop the blade cutting through the bag and injuring whoever carries it. Sharps are a separate waste stream.",
          },
          {
            textAr: "في كيس النفايات العامة لأنها صغيرة.",
            textEn: "Into the general waste bag, since it is small.",
            isCorrect: false,
            stepKey: "segregation",
            feedbackAr: "غير صحيح. شفرة ملوثة في النفايات العامة خطر جرح وعدوى على عامل نظافة لا يتوقعها.",
            feedbackEn: "Not right. A contaminated blade in general waste is a cut and infection risk for a cleaner who does not expect it.",
          },
          {
            textAr: "في حاوية الأدوات الحادة المقاومة للثقب على العربة.",
            textEn: "Into the puncture-resistant sharps container on the trolley.",
            isCorrect: true,
            stepKey: "segregation",
            feedbackAr: "صحيح. الشفرات والإبر وكل ما يمكن أن يثقب أو يجرح مكانه حاوية الأدوات الحادة فقط (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Blades, needles and anything else that can pierce or cut belong only in the sharps container (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "امتلأ الكيس المعدي على العربة إلى ما فوق ثلاثة أرباعه بقليل، وبقيت ضمادة مريض أخير.",
        contextEn: "The infectious bag on the trolley is now just over three-quarters full, and one last patient’s dressing is left.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أغلق هذا الكيس الآن، وأبدأ كيسًا جديدًا للضمادة الأخيرة.",
            textEn: "I close this bag now and start a new one for the last dressing.",
            isCorrect: true,
            stepKey: "bag-fill-level",
            feedbackAr: "صحيح. الأكياس لا تُملأ أكثر من ثلاثة أرباعها، حتى يمكن إغلاقها بإحكام دون أن تتمزق أو تنسكب أثناء النقل (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Bags are filled to no more than three-quarters so they can be sealed tightly without tearing or spilling on the way (WHO).",
          },
          {
            textAr: "أضغط المحتوى بيدي لأفسح مكانًا للضمادة الأخيرة.",
            textEn: "I press the contents down by hand to make room for the last dressing.",
            isCorrect: false,
            stepKey: "bag-fill-level",
            feedbackAr:
              "غير صحيح. ضغط النفايات باليد قد يعرّضك لأداة حادة وُضعت في الكيس خطأً أو لرذاذ من محتواه، ولا يحل مشكلة الامتلاء.",
            feedbackEn:
              "Not right. Pressing waste down by hand can expose you to a sharp put in the bag by mistake, or to splashes, and it does not solve the overfilling.",
          },
          {
            textAr: "أكمل الملء حتى الحافة ثم أغلقه، فهي ضمادة واحدة فقط.",
            textEn: "I fill it to the top and then close it; it is only one more dressing.",
            isCorrect: false,
            stepKey: "bag-fill-level",
            feedbackAr: "غير صحيح. الكيس الممتلئ حتى حافته يصعب ربطه بإحكام، وقد ينفتح أو يتمزق أثناء النقل.",
            feedbackEn: "Not right. A bag filled to the top is hard to tie securely and may open or tear on the way.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "الكيس جاهز للنقل إلى غرفة الأدوات المتسخة.",
        contextEn: "The bag is ready to go to the dirty utility room.",
        promptAr: "اختر كل الخطوات الصحيحة قبل نقل الكيس وأثناءه.",
        promptEn: "Choose all the correct steps before and while the bag is moved.",
        options: [
          {
            textAr: "أربط عنق الكيس بإحكام.",
            textEn: "Tie the neck of the bag securely.",
            isCorrect: true,
            stepKey: "sealed-bags",
            feedbackAr: "صحيح. الكيس المربوط بإحكام يمنع الانسكاب والتسرب أثناء النقل.",
            feedbackEn: "Correct. A securely tied bag prevents spills and leaks on the way.",
          },
          {
            textAr: "أضع الكيس المعدي داخل كيس نفايات عامة حتى لا يلفت الانتباه.",
            textEn: "Put the infectious bag inside a general-waste bag so it does not draw attention.",
            isCorrect: false,
            stepKey: "segregation",
            feedbackAr: "غير صحيح. إخفاء الكيس المعدي داخل كيس عام يضلل الناقل ومنشأة المعالجة، فيُعامل معاملة النفايات العامة.",
            feedbackEn: "Not right. Hiding an infectious bag inside a general one misleads the porter and the treatment facility, so it is handled as general waste.",
          },
          {
            textAr: "أضع عليه الوسم المطلوب في منشأتي (القسم والتاريخ).",
            textEn: "Label it as my facility requires (unit and date).",
            isCorrect: true,
            stepKey: "sealed-bags",
            feedbackAr: "صحيح. الوسم يخبر الناقل بنوع الخطر، ويتيح تتبع مصدر الكيس إن حدثت مشكلة.",
            feedbackEn: "Correct. The label tells the handler what hazard it holds and lets the bag be traced if something goes wrong.",
          },
          {
            textAr: "أحمل الكيس من عنقه بعيدًا عن جسمي.",
            textEn: "Carry the bag by its neck, away from my body.",
            isCorrect: true,
            feedbackAr: "صحيح. حمل الكيس من عنقه بعيدًا عن الجسم يقلل خطر الوخز بأداة وُضعت فيه خطأً (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Holding the bag by the neck, away from your body, reduces the risk from a sharp put in it by mistake (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "في غرفة الأدوات المتسخة، غطاء حاوية النفايات المعدية مكسور ويبقى مفتوحًا دائمًا.",
        contextEn: "In the dirty utility room, the lid of the infectious-waste bin is broken and stays open all the time.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أتركها مفتوحة، فهذا أسرع عند رمي النفايات.",
            textEn: "I leave it open; it is quicker for throwing waste in.",
            isCorrect: false,
            stepKey: "closed-bins",
            feedbackAr: "غير صحيح. الحاوية المكشوفة تنشر التلوث وتجذب الحشرات، والسرعة لا تبرر ذلك.",
            feedbackEn: "Not right. An open bin spreads contamination and attracts pests; speed does not justify it.",
          },
          {
            textAr: "أبلغ عن الكسر، وأطلب استبدالها بحاوية لها غطاء يُفتح بالقدم.",
            textEn: "I report the broken lid and ask for a replacement bin with a foot-operated lid.",
            isCorrect: true,
            stepKey: "closed-bins",
            feedbackAr: "صحيح. الحاوية المغطاة التي تُفتح بالقدم تمنع انتشار التلوث، وتغنيك عن لمس الغطاء بيدك.",
            feedbackEn: "Correct. A covered, foot-operated bin keeps contamination in and saves you touching the lid by hand.",
          },
          {
            textAr: "أغطيها بمنشفة قماشية حتى يُستبدل الغطاء.",
            textEn: "I cover it with a cloth towel until the lid is replaced.",
            isCorrect: false,
            stepKey: "closed-bins",
            feedbackAr: "غير صحيح. المنشفة تتلوث، ويُضطر كل من يرمي النفايات إلى رفعها بيده. أبلغ ليُستبدل الغطاء أو الحاوية.",
            feedbackEn: "Not right. The towel gets contaminated and everyone has to lift it by hand to use the bin. Report it so the lid or the bin is replaced.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "وأنت عائد، تلاحظ كيسين ممتلئين مربوطين في الممر أمام غرف المرضى منذ الصباح.",
        contextEn: "On your way back, you notice two full, tied bags that have been in the corridor outside the patients’ rooms since the morning.",
        promptAr: "ما التصرف الصحيح؟",
        promptEn: "What is the right thing to do?",
        options: [
          {
            textAr: "أتركهما لمناوبة الليل، فجمع النفايات من مهامهم.",
            textEn: "I leave them for the night shift; collecting waste is their job.",
            isCorrect: false,
            stepKey: "prompt-removal",
            feedbackAr: "غير صحيح. بقاء الأكياس ساعات في الممر يزيد خطر التلوث والحوادث، ومن يلاحظها يتصرف أو يبلّغ.",
            feedbackEn: "Not right. Bags left for hours in the corridor raise the risk of contamination and accidents; whoever notices them acts or reports it.",
          },
          {
            textAr: "أدخلهما إلى غرفة مريض فارغة حتى لا يراهما الزوار.",
            textEn: "I move them into an empty patient room so visitors do not see them.",
            isCorrect: false,
            stepKey: "prompt-removal",
            feedbackAr: "غير صحيح. غرف المرضى ليست مكانًا لتخزين النفايات حتى لو كانت فارغة، وستُستخدم لمريض بعد قليل.",
            feedbackEn: "Not right. Patient rooms are not for storing waste, even when empty, and the room will soon be used for a patient.",
          },
          {
            textAr: "أنقلهما الآن، أو أطلب من الناقل نقلهما، إلى منطقة التخزين المؤقت المخصصة.",
            textEn: "I take them now, or ask the porter to take them, to the designated temporary storage area.",
            isCorrect: true,
            stepKey: "prompt-removal",
            feedbackAr: "صحيح. نقل الأكياس الممتلئة دون تأخير إلى منطقة التخزين المخصصة يمنع تكدسها في الممرات ومناطق المرضى.",
            feedbackEn: "Correct. Moving full bags promptly to the designated storage area stops them piling up in corridors and patient areas.",
          },
        ],
      },
    ],
  },

  // 6 ── environmental cleaning ─────────────────────────────────────────────────────────────────────
  {
    slug: "room-cleaning-after-discharge",
    protocolSlug: "environmental-cleaning",
    titleAr: "تنظيف غرفة بعد خروج مريض",
    titleEn: "Cleaning a room after a patient is discharged",
    introAr: "جهّز غرفة لمريض جديد: من أين يبدأ التنظيف، وماذا يُنظّف، وماذا تفعل بمرتبة ممزقة وأجهزة مشتركة.",
    introEn: "Get a room ready for a new patient: where cleaning starts, what gets cleaned, and what to do with a torn mattress and shared equipment.",
    settingAr:
      "مستشفى عام في المدينة المنورة، جناح الباطنية، الغرفة 12. خرج المريض قبل نصف ساعة، وسيصل مريض جديد من الطوارئ بعد ساعة. أنت المشرف على تجهيز الغرفة مع عامل النظافة.",
    settingEn:
      "A general hospital in Madinah, medical ward, room 12. The patient was discharged half an hour ago, and a new patient will arrive from the emergency department in an hour. You are supervising the room’s preparation with the cleaner.",
    difficulty: "beginner",
    estimatedMinutes: 6,
    stages: [
      {
        kind: "single",
        promptAr: "من أين يبدأ التنظيف؟",
        promptEn: "Where should the cleaning start?",
        options: [
          {
            textAr: "من دورة المياه أولًا لأنها الأكثر اتساخًا، ثم بقية الغرفة.",
            textEn: "With the bathroom first, since it is the dirtiest, then the rest of the room.",
            isCorrect: false,
            stepKey: "clean-to-dirty",
            feedbackAr: "غير صحيح. البدء بالأكثر اتساخًا ينقل الميكروبات بالقطع والقفازات إلى الأسطح التي ستُنظف بعدها.",
            feedbackEn: "Not right. Starting with the dirtiest area carries microorganisms on the cloths and gloves onto the surfaces cleaned afterwards.",
          },
          {
            textAr: "من الأسطح الأنظف والأعلى، والانتهاء بدورة المياه ثم الأرضية.",
            textEn: "With the cleanest and highest surfaces, finishing with the bathroom and then the floor.",
            isCorrect: true,
            stepKey: "clean-to-dirty",
            feedbackAr:
              "صحيح. التنظيف من النظيف إلى المتسخ ومن الأعلى إلى الأسفل يمنع إعادة تلويث ما نُظف للتو (أفضل ممارسات التنظيف البيئي، CDC).",
            feedbackEn:
              "Correct. Cleaning from clean to dirty and from high to low stops you re-contaminating what you just cleaned (CDC best practices for environmental cleaning).",
          },
          {
            textAr: "من الأرضية أولًا ليتسع الوقت لجفافها.",
            textEn: "With the floor first, so it has time to dry.",
            isCorrect: false,
            stepKey: "clean-to-dirty",
            feedbackAr: "غير صحيح. الغبار والقطرات من الأسطح العليا ستسقط على الأرضية النظيفة، فتُضطر إلى تنظيفها مرة أخرى.",
            feedbackEn: "Not right. Dust and drips from higher surfaces will fall on the clean floor, and you will have to do it again.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "يسألك عامل النظافة: «هل أمسح ما يبدو متسخًا فقط؟»",
        contextEn: "The cleaner asks you: “Shall I just wipe what looks dirty?”",
        promptAr: "اختر كل الأسطح كثيرة اللمس التي يجب تنظيفها وتطهيرها.",
        promptEn: "Choose all the high-touch surfaces that must be cleaned and disinfected.",
        options: [
          {
            textAr: "حواجز السرير وأزرار التحكم به.",
            textEn: "The bed rails and bed controls.",
            isCorrect: true,
            stepKey: "high-touch-surfaces",
            feedbackAr: "صحيح. حواجز السرير من أكثر الأسطح لمسًا من المريض والعاملين، وتنقل الميكروبات بين الأيدي.",
            feedbackEn: "Correct. Bed rails are among the most-touched surfaces for patients and staff, and they pass microorganisms between hands.",
          },
          {
            textAr: "زر النداء وجهاز التحكم بالتلفاز.",
            textEn: "The call button and the TV remote.",
            isCorrect: true,
            stepKey: "high-touch-surfaces",
            feedbackAr: "صحيح. يمسكهما المريض مرات كثيرة في اليوم، ويُنسيان كثيرًا عند التنظيف.",
            feedbackEn: "Correct. The patient handles them many times a day, and they are often forgotten during cleaning.",
          },
          {
            textAr: "الأسطح التي يظهر عليها اتساخ فقط.",
            textEn: "Only the surfaces that look dirty.",
            isCorrect: false,
            stepKey: "high-touch-surfaces",
            feedbackAr: "غير صحيح. الميكروبات لا تُرى بالعين، وقد تبقى أيامًا على أسطح تبدو نظيفة. الأسطح كثيرة اللمس تُطهّر دائمًا.",
            feedbackEn: "Not right. Microorganisms are invisible and can survive for days on surfaces that look clean. High-touch surfaces are always disinfected.",
          },
          {
            textAr: "مقبض الباب ومفاتيح الإضاءة.",
            textEn: "The door handle and the light switches.",
            isCorrect: true,
            stepKey: "high-touch-surfaces",
            feedbackAr: "صحيح. يلمسهما كل من يدخل الغرفة أو يخرج منها.",
            feedbackEn: "Correct. Everyone who enters or leaves the room touches them.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "يستخدم عامل النظافة قطعة قماش واحدة ودلوًا واحدًا للغرفة كلها.",
        contextEn: "The cleaner is using one cloth and one bucket for the whole room.",
        promptAr: "ما التوجيه الصحيح؟",
        promptEn: "What is the right instruction?",
        options: [
          {
            textAr: "لا بأس، ما دام يشطف القطعة في الدلو بين الأسطح.",
            textEn: "That is fine, as long as he rinses the cloth in the bucket between surfaces.",
            isCorrect: false,
            stepKey: "clean-to-dirty",
            feedbackAr: "غير صحيح. شطف القطعة في الدلو نفسه يجعل الماء مصدر تلوث ينشر الميكروبات على كل سطح.",
            feedbackEn: "Not right. Rinsing in the same bucket turns the water into a source of contamination that spreads microorganisms onto every surface.",
          },
          {
            textAr: "يمكنه استخدام قطعة الأمس إذا شُطفت جيدًا.",
            textEn: "He can use yesterday’s cloth if it was rinsed well.",
            isCorrect: false,
            stepKey: "clean-to-dirty",
            feedbackAr: "غير صحيح. القطعة الرطبة المستعملة بيئة مناسبة لتكاثر البكتيريا، والشطف وحده لا يطهرها.",
            feedbackEn: "Not right. A used damp cloth is a good place for bacteria to grow, and rinsing alone does not disinfect it.",
          },
          {
            textAr: "قطعة نظيفة لكل منطقة، وتُرسل المستعملة للغسيل أو يُتخلص منها.",
            textEn: "A fresh cloth for each area, with used ones sent to the laundry or discarded.",
            isCorrect: true,
            stepKey: "clean-to-dirty",
            feedbackAr: "صحيح. القطع النظيفة لكل منطقة تمنع نقل الميكروبات من سطح إلى آخر (CDC).",
            feedbackEn: "Correct. Fresh cloths for each area stop microorganisms moving from one surface to the next (CDC).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "عند رفع الملاءة تلاحظ تمزقًا صغيرًا في غطاء المرتبة، وتحته بقعة داكنة.",
        contextEn: "When you lift the sheet you notice a small tear in the mattress cover, with a dark stain underneath.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أبلغ عنها، وأُخرج المرتبة من الاستخدام حتى تُستبدل بمرتبة سليمة.",
            textEn: "I report it and take the mattress out of use until it is replaced with an intact one.",
            isCorrect: true,
            stepKey: "bed-clean",
            feedbackAr: "صحيح. المرتبة ذات الغطاء الممزق لا يمكن تطهيرها تطهيرًا موثوقًا، وقد تنقل العدوى إلى المريض التالي (CDC).",
            feedbackEn: "Correct. A mattress with a torn cover cannot be reliably disinfected and may pass infection to the next patient (CDC).",
          },
          {
            textAr: "أمسح سطح المرتبة بالمطهر وأقلبها على الجهة الأخرى.",
            textEn: "I wipe the mattress surface with disinfectant and turn it over.",
            isCorrect: false,
            stepKey: "bed-clean",
            feedbackAr: "غير صحيح. السوائل تسربت إلى داخل المرتبة عبر التمزق ولا يصل إليها أي مطهر، وقلبها يخفي المشكلة فقط.",
            feedbackEn: "Not right. Fluid has soaked into the mattress through the tear, no disinfectant can reach it, and turning it over only hides the problem.",
          },
          {
            textAr: "ألصق شريطًا لاصقًا على التمزق وأجهّز السرير.",
            textEn: "I tape over the tear and make the bed.",
            isCorrect: false,
            stepKey: "bed-clean",
            feedbackAr: "غير صحيح. الشريط لا يعالج التلوث الموجود داخل المرتبة، ويصعب تطهير سطحه وحوافه.",
            feedbackEn: "Not right. Tape does nothing about the contamination already inside the mattress, and its surface and edges are hard to disinfect.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "جهاز قياس الضغط ومقياس الأكسجين في الإصبع سيبقيان في الغرفة للمريض الجديد.",
        contextEn: "The blood-pressure monitor and the finger pulse oximeter will stay in the room for the new patient.",
        promptAr: "كيف تتعامل معهما؟",
        promptEn: "How do you deal with them?",
        options: [
          {
            textAr: "لا حاجة إلى شيء لأنهما لا يلامسان دمًا.",
            textEn: "Nothing is needed, since they never touch blood.",
            isCorrect: false,
            stepKey: "shared-equipment",
            feedbackAr: "غير صحيح. كفة الضغط ومقياس الأكسجين يلامسان جلد المريض ويديه، وقد يحملان ميكروبات مقاومة للمضادات دون أي دم ظاهر.",
            feedbackEn: "Not right. The cuff and the oximeter touch the patient’s skin and hands and can carry drug-resistant organisms without any visible blood.",
          },
          {
            textAr: "أنظفهما وأطهرهما حسب تعليمات الصانع وسياسة المنشأة قبل وصول المريض الجديد.",
            textEn: "I clean and disinfect them according to the manufacturer’s instructions and facility policy before the new patient arrives.",
            isCorrect: true,
            stepKey: "shared-equipment",
            feedbackAr: "صحيح. الأجهزة المشتركة بين المرضى تُنظف وتُطهر بعد كل استخدام، وإلا نقلت الميكروبات من مريض إلى آخر (CDC).",
            feedbackEn: "Correct. Equipment shared between patients is cleaned and disinfected after each use, or it carries microorganisms from one patient to the next (CDC).",
          },
          {
            textAr: "أمسحهما بقطعة القماش نفسها التي نُظفت بها دورة المياه.",
            textEn: "I wipe them with the same cloth that was used for the bathroom.",
            isCorrect: false,
            stepKey: "shared-equipment",
            feedbackAr: "غير صحيح. قطعة دورة المياه من أكثر الأدوات تلوثًا، واستخدامها على الأجهزة ينقل التلوث إليها بدل إزالته.",
            feedbackEn: "Not right. The bathroom cloth is one of the most contaminated items, and using it on the devices adds contamination instead of removing it.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "قبل أن تعلن جاهزية الغرفة، تنظر إلى الطاولة الجانبية وطاولة الطعام.",
        contextEn: "Before you declare the room ready, you look at the bedside table and the overbed table.",
        promptAr: "اختر كل ما يجب أن يتم.",
        promptEn: "Choose everything that has to be done.",
        options: [
          {
            textAr: "إزالة كل الأدوات المستعملة والضمادات وبقايا الطعام عن الطاولتين.",
            textEn: "Remove all used items, dressings and food leftovers from both tables.",
            isCorrect: true,
            stepKey: "bedside-tables",
            feedbackAr: "صحيح. الطاولة المكدسة بالمستعمل تمنع التنظيف الفعال وتخلط النظيف بالملوث.",
            feedbackEn: "Correct. A table cluttered with used items cannot be cleaned properly and mixes clean with contaminated.",
          },
          {
            textAr: "ترك أكواب الدواء الفارغة للمريض السابق ليجمعها الصيدلي.",
            textEn: "Leave the previous patient’s empty medicine cups for the pharmacist to collect.",
            isCorrect: false,
            stepKey: "bedside-tables",
            feedbackAr: "غير صحيح. الأكواب المستعملة نفايات تُزال الآن، ولا ينبغي أن يجدها المريض الجديد على طاولته.",
            feedbackEn: "Not right. Used cups are waste to be removed now; the new patient should never find them on his table.",
          },
          {
            textAr: "تنظيف سطح الطاولتين وتطهيره بعد إخلائهما.",
            textEn: "Clean and disinfect both table tops once they are clear.",
            isCorrect: true,
            stepKey: "bedside-tables",
            feedbackAr: "صحيح. يتناول المريض طعامه على طاولة الطعام، فنظافتها جزء مباشر من سلامته.",
            feedbackEn: "Correct. The patient eats from the overbed table, so keeping it clean is directly part of his safety.",
          },
        ],
      },
    ],
  },

  // 7 ── hand hygiene station ───────────────────────────────────────────────────────────────────────
  {
    slug: "hand-hygiene-station-icu",
    protocolSlug: "hand-hygiene-station",
    titleAr: "جولة على محطات نظافة اليدين في العناية المركزة",
    titleEn: "Checking the hand hygiene stations in intensive care",
    introAr: "تجوّل على مغاسل العناية المركزة ومعقماتها: صابون فارغ، ومنشفة قماشية، وحنفية تقطر.",
    introEn: "Walk round the intensive care sinks and hand rub points: an empty soap dispenser, a cloth towel and a dripping tap.",
    settingAr:
      "وحدة العناية المركزة في مستشفى تخصصي بالرياض، الساعة السابعة صباحًا. أنت ممثل مكافحة العدوى في الوحدة، وتبدأ جولتك الأسبوعية على محطات نظافة اليدين قبل جولة الأطباء.",
    settingEn:
      "The intensive care unit of a specialist hospital in Riyadh, 7 a.m. You are the unit’s infection control link nurse, starting your weekly round of the hand hygiene stations before the doctors’ round.",
    difficulty: "beginner",
    estimatedMinutes: 5,
    stages: [
      {
        kind: "single",
        contextAr: "في حوض مغسلة السرير 3 كوب دواء مستعمل، وبجانبه وعاء عينة بول مغلق ينتظر النقل.",
        contextEn: "In the basin of the sink at bed 3 there is a used medicine cup, and beside it a closed urine specimen pot waiting to be sent.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أتركهما، فممرضة السرير ستأخذهما بعد قليل.",
            textEn: "I leave them; the bedside nurse will take them shortly.",
            isCorrect: false,
            stepKey: "sink-clean",
            feedbackAr: "غير صحيح. وجودهما في الحوض يعيق غسل اليدين ويعرّضهما للرذاذ، ومن يلاحظ المشكلة يصلحها.",
            feedbackEn: "Not right. They get in the way of hand washing and are exposed to splashes; whoever spots the problem fixes it.",
          },
          {
            textAr: "أزيلهما، وأنظف الحوض، وأذكّر الفريق بأن المغسلة لغسل اليدين فقط.",
            textEn: "I remove them, clean the basin and remind the team that the sink is for hand washing only.",
            isCorrect: true,
            stepKey: "sink-clean",
            feedbackAr: "صحيح. المغاسل الرطبة قد تصبح مستودعًا لبكتيريا مثل الزائفة، وما يوضع فيها أو بجانبها يتلوث برذاذها (CDC).",
            feedbackEn: "Correct. Wet sinks can become reservoirs of bacteria such as Pseudomonas, and anything placed in or beside them is contaminated by the splashes (CDC).",
          },
          {
            textAr: "أشطف الكوب في الحوض وأتركه يجف على حافته.",
            textEn: "I rinse the cup in the basin and leave it to dry on the edge.",
            isCorrect: false,
            stepKey: "sink-clean",
            feedbackAr: "غير صحيح. مغسلة اليدين ليست لغسل الأدوات، وشطف الكوب فيها يلوث الحوض والكوب معًا.",
            feedbackEn: "Not right. A hand-wash sink is not for washing equipment; rinsing the cup there contaminates both the basin and the cup.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "موزع الصابون السائل فارغ، ووضع أحدهم قطعة صابون صلبة على حافة المغسلة.",
        contextEn: "The liquid soap dispenser is empty, and someone has put a bar of soap on the edge of the sink.",
        promptAr: "ما التصرف الصحيح؟",
        promptEn: "What is the right thing to do?",
        options: [
          {
            textAr: "أعيد ملء الموزع بسكب صابون من عبوة كبيرة في المخزن.",
            textEn: "I top up the dispenser by pouring soap from a large bottle in the store.",
            isCorrect: false,
            stepKey: "liquid-soap",
            feedbackAr:
              "غير صحيح. توصي منظمة الصحة العالمية بعدم إضافة الصابون إلى موزع فارغ أو نصف فارغ، لأن ذلك قد يلوث الصابون بالبكتيريا. استخدم عبوة جديدة مختومة.",
            feedbackEn:
              "Not right. WHO advises against topping up empty or partly empty dispensers, because this can contaminate the soap with bacteria. Use a new sealed cartridge.",
          },
          {
            textAr: "أترك الصابون الصلب حتى يُعاد ملء الموزع.",
            textEn: "I leave the bar soap until the dispenser is refilled.",
            isCorrect: false,
            stepKey: "liquid-soap",
            feedbackAr: "غير صحيح. قطعة الصابون الصلبة المشتركة تبقى رطبة، وقد تتلوث بالميكروبات وتنقلها بين الأيدي.",
            feedbackEn: "Not right. A shared bar of soap stays wet and can become contaminated and pass microorganisms between hands.",
          },
          {
            textAr: "أزيل الصابون الصلب، وأطلب تركيب عبوة صابون جديدة مختومة في الموزع فورًا.",
            textEn: "I remove the bar soap and have a new sealed soap cartridge fitted in the dispenser at once.",
            isCorrect: true,
            stepKey: "liquid-soap",
            feedbackAr: "صحيح. الصابون السائل في موزع مغلق هو الخيار الآمن، والعبوة الجديدة المختومة تمنع التلوث (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Liquid soap in a closed dispenser is the safe choice, and a new sealed cartridge prevents contamination (WHO).",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "تتحقق من أماكن موزعات المعقم الكحولي في الوحدة.",
        contextEn: "You check where the alcohol-based hand rub dispensers are in the unit.",
        promptAr: "اختر كل الأماكن التي يجب أن يتوفر فيها المعقم الكحولي.",
        promptEn: "Choose all the places where alcohol-based hand rub should be available.",
        options: [
          {
            textAr: "عند نقطة تقديم الرعاية، في متناول اليد بجانب كل سرير.",
            textEn: "At the point of care, within reach next to every bed.",
            isCorrect: true,
            stepKey: "alcohol-hand-rub",
            feedbackAr:
              "صحيح. المعقم في متناول اليد عند السرير يتيح تنظيف اليدين في اللحظات الخمس دون مغادرة المريض، فيرتفع الالتزام (منظمة الصحة العالمية).",
            feedbackEn:
              "Correct. Hand rub within reach at the bedside lets staff clean their hands at the five moments without leaving the patient, which raises compliance (WHO).",
          },
          {
            textAr: "في غرفة استراحة الفريق فقط، حتى لا يعبث به المرضى.",
            textEn: "Only in the staff room, so patients don’t tamper with it.",
            isCorrect: false,
            stepKey: "alcohol-hand-rub",
            feedbackAr: "غير صحيح. المعقم البعيد عن السرير لا يُستخدم في اللحظات التي يحتاجها المريض، فتضيع فائدته.",
            feedbackEn: "Not right. Hand rub far from the bed is not used at the moments the patient needs it, so it loses its point.",
          },
          {
            textAr: "عند مدخل كل غرفة أو حيّز سرير.",
            textEn: "At the entrance to every room or bed space.",
            isCorrect: true,
            stepKey: "alcohol-hand-rub",
            feedbackAr: "صحيح. المعقم عند المدخل يذكّر بتنظيف اليدين عند الدخول والخروج.",
            feedbackEn: "Correct. Hand rub at the entrance prompts hand hygiene on the way in and out.",
          },
          {
            textAr: "لا حاجة إليه في الغرف التي فيها مغسلة.",
            textEn: "It is not needed in rooms that have a sink.",
            isCorrect: false,
            stepKey: "alcohol-hand-rub",
            feedbackAr:
              "غير صحيح. المعقم الكحولي هو الوسيلة المفضلة في معظم المواقف لأنه أسرع وأكثر فاعلية، ووجود المغسلة لا يغني عنه إلا حين تكون اليدان متسختين بشكل ظاهر (منظمة الصحة العالمية).",
            feedbackEn:
              "Not right. Alcohol-based hand rub is the preferred method in most situations because it is faster and more effective; a sink does not replace it, except when hands are visibly soiled (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "موزع المناديل الورقية فارغ، وعُلّقت منشفة قماشية بجانب المغسلة.",
        contextEn: "The paper towel dispenser is empty, and a cloth towel has been hung next to the sink.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أترك المنشفة، وأطلب تغييرها كل مناوبة.",
            textEn: "I leave the towel and ask for it to be changed every shift.",
            isCorrect: false,
            stepKey: "paper-towels",
            feedbackAr: "غير صحيح. المنشفة المشتركة تتلوث من أول استخدام، وتعيد الميكروبات إلى كل يد تُغسل بعدها مهما غُيّرت.",
            feedbackEn: "Not right. A shared towel is contaminated from the first use and puts microorganisms back on every pair of hands after it, however often it is changed.",
          },
          {
            textAr: "أزيل المنشفة القماشية، وأملأ الموزع بالمناديل الورقية.",
            textEn: "I remove the cloth towel and refill the paper towel dispenser.",
            isCorrect: true,
            stepKey: "paper-towels",
            feedbackAr: "صحيح. المناديل الورقية للاستخدام مرة واحدة تجفف اليدين دون أن تعيد تلويثهما (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Single-use paper towels dry hands without re-contaminating them (WHO).",
          },
          {
            textAr: "أنصح الفريق بتجفيف أيديهم على الزي حتى تصل المناديل.",
            textEn: "I tell the team to dry their hands on their uniforms until the towels arrive.",
            isCorrect: false,
            stepKey: "paper-towels",
            feedbackAr: "غير صحيح. الزي يحمل ميكروبات تعود إلى اليدين بعد غسلهما. أعِد ملء الموزع الآن.",
            feedbackEn: "Not right. Uniforms carry microorganisms that go straight back onto freshly washed hands. Refill the dispenser now.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "الحنفية في مغسلة السرير 6 تقطر باستمرار، ويتجمع الماء حول قاعدتها.",
        contextEn: "The tap at the bed 6 sink drips constantly, and water is pooling around its base.",
        promptAr: "ما التصرف الصحيح؟",
        promptEn: "What is the right thing to do?",
        options: [
          {
            textAr: "لا أفعل شيئًا، فالتنقيط بسيط.",
            textEn: "I do nothing; it is only a small drip.",
            isCorrect: false,
            stepKey: "faucet-works",
            feedbackAr: "غير صحيح. التنقيط المستمر يُبقي المغسلة رطبة دائمًا، وهذا ما تحتاجه بكتيريا مثل الزائفة لتستقر فيها.",
            feedbackEn: "Not right. A constant drip keeps the sink permanently wet, which is just what bacteria such as Pseudomonas need to settle in.",
          },
          {
            textAr: "أضع منشفة تحت الحنفية بشكل دائم لتمتص الماء.",
            textEn: "I put a towel under the tap permanently to soak up the water.",
            isCorrect: false,
            stepKey: "faucet-works",
            feedbackAr: "غير صحيح. المنشفة الرطبة الدائمة تصبح بؤرة تلوث جديدة، ولا توقف التسريب.",
            feedbackEn: "Not right. A permanently wet towel becomes a new source of contamination and does not stop the leak.",
          },
          {
            textAr: "أبلغ قسم الصيانة الآن، وأجفف الماء المتجمع.",
            textEn: "I report it to maintenance now and dry the pooled water.",
            isCorrect: true,
            stepKey: "faucet-works",
            feedbackAr: "صحيح. التسريب والماء الراكد يغذيان نمو البكتيريا حول المغسلة، والإبلاغ الفوري يعالج السبب من أصله.",
            feedbackEn: "Correct. Leaks and standing water feed bacterial growth around the sink, and reporting it now fixes the cause.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "تلاحظ أن ملصق طريقة نظافة اليدين قرب المغسلة الرئيسية نُزع أثناء طلاء الجدار.",
        contextEn: "You notice the hand hygiene technique poster near the main sink was taken down while the wall was painted.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أطلب إعادة تعليق الملصق الذي يوضح طريقة نظافة اليدين ولحظاتها الخمس.",
            textEn: "I ask for the poster showing hand hygiene technique and the five moments to be put back up.",
            isCorrect: true,
            stepKey: "technique-poster",
            feedbackAr:
              "صحيح. التذكير المرئي في مكان الإجراء يحسّن الالتزام والتقنية الصحيحة، وهو جزء من الاستراتيجية متعددة الوسائل لمنظمة الصحة العالمية.",
            feedbackEn: "Correct. A visual reminder where the action happens improves compliance and technique, and it is part of WHO’s multimodal strategy.",
          },
          {
            textAr: "لا حاجة إليه؛ فريق العناية المركزة يعرف طريقة غسل اليدين.",
            textEn: "It isn’t needed; the ICU team knows how to wash hands.",
            isCorrect: false,
            stepKey: "technique-poster",
            feedbackAr: "غير صحيح. حتى الفرق ذات الخبرة تستفيد من التذكير، وللمغسلة مستخدمون آخرون مثل الطلاب والزوار.",
            feedbackEn: "Not right. Even experienced teams benefit from reminders, and the sink has other users, such as students and visitors.",
          },
        ],
      },
    ],
  },

  // 8 ── culture and specimen area ──────────────────────────────────────────────────────────────────
  {
    slug: "specimen-bench-lab",
    protocolSlug: "culture-specimen-area",
    titleAr: "طاولة استقبال العينات في المختبر",
    titleEn: "The specimen reception bench in the laboratory",
    introAr: "ابدأ مناوبتك في استقبال عينات المختبر: أغراض شخصية على الطاولة، وعينات بلا وسم، وأنبوب ينكسر.",
    introEn: "Start your shift at the laboratory’s specimen reception: personal items on the bench, unlabelled specimens and a tube that breaks.",
    settingAr:
      "مختبر الأحياء الدقيقة في مستشفى عام بمكة المكرمة، الساعة الثانية ظهرًا. أنت فني المختبر المسؤول عن استقبال العينات وتجهيزها في هذه المناوبة.",
    settingEn:
      "The microbiology laboratory of a general hospital in Makkah, 2 p.m. You are the laboratory technician responsible for receiving and preparing specimens this shift.",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    stages: [
      {
        kind: "single",
        contextAr: "على طاولة العينات هاتف زميل وكوب قهوة نصف ممتلئ.",
        contextEn: "On the specimen bench there is a colleague’s phone and a half-full cup of coffee.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أنقل الكوب والهاتف إلى زاوية الطاولة بعيدًا عن العينات.",
            textEn: "I move the cup and the phone to a corner of the bench, away from the specimens.",
            isCorrect: false,
            stepKey: "no-personal-items",
            feedbackAr: "غير صحيح. زاوية الطاولة ما زالت منطقة عمل يصلها الرذاذ، والكوب المكشوف فيها خطر ابتلاع مباشر.",
            feedbackEn: "Not right. The corner of the bench is still a work area that splashes can reach, and an open cup there is a direct ingestion risk.",
          },
          {
            textAr: "أطلب من زميلي إبعادهما؛ فالأغراض الشخصية تبقى خارج منطقة العمل.",
            textEn: "I ask my colleague to take them away; personal items stay outside the work area.",
            isCorrect: true,
            stepKey: "no-personal-items",
            feedbackAr:
              "صحيح. الأغراض الشخصية تتلوث في منطقة العينات ثم تخرج مع صاحبها إلى خارج المختبر (دليل منظمة الصحة العالمية للسلامة الحيوية في المختبرات).",
            feedbackEn: "Correct. Personal items get contaminated in the specimen area and then leave the laboratory with their owner (WHO Laboratory Biosafety Manual).",
          },
          {
            textAr: "أمسح الهاتف بالكحول وأتركه مكانه.",
            textEn: "I wipe the phone with alcohol and leave it where it is.",
            isCorrect: false,
            stepKey: "no-personal-items",
            feedbackAr: "غير صحيح. مسح الهاتف مرة لا يمنع تلوثه من جديد ما دام في منطقة العمل، والمشكلة في وجوده هناك أصلًا.",
            feedbackEn: "Not right. Wiping the phone once does not stop it being contaminated again while it stays in the work area; the problem is that it is there at all.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "قبل أن تبدأ تجهيز العينات، تبدو الطاولة نظيفة.",
        contextEn: "Before you start preparing specimens, the bench looks clean.",
        promptAr: "ماذا تفعل بسطح العمل؟",
        promptEn: "What do you do with the work surface?",
        options: [
          {
            textAr: "أطهّر السطح بالمطهر المعتمد قبل البدء، وسأطهره بعد الانتهاء وبعد أي انسكاب.",
            textEn: "I decontaminate it with the approved disinfectant before starting, and will again after finishing and after any spill.",
            isCorrect: true,
            stepKey: "surface-decontamination",
            feedbackAr: "صحيح. تطهير سطح العمل قبل العمل وبعده وبعد أي انسكاب من الممارسات المخبرية الأساسية (منظمة الصحة العالمية).",
            feedbackEn: "Correct. Decontaminating the bench before and after work and after any spill is a core laboratory practice (WHO).",
          },
          {
            textAr: "أبدأ العمل مباشرة، فالسطح يبدو نظيفًا.",
            textEn: "I start working right away; the surface looks clean.",
            isCorrect: false,
            stepKey: "surface-decontamination",
            feedbackAr: "غير صحيح. الميكروبات لا تُرى، والسطح الذي يبدو نظيفًا قد يحمل تلوثًا من المناوبة السابقة.",
            feedbackEn: "Not right. Microorganisms are invisible, and a surface that looks clean may still carry contamination from the previous shift.",
          },
          {
            textAr: "أمسحه بمنديل ورقي جاف.",
            textEn: "I wipe it with a dry paper towel.",
            isCorrect: false,
            stepKey: "surface-decontamination",
            feedbackAr: "غير صحيح. المنديل الجاف ينقل الغبار فقط ولا يقتل الميكروبات. التطهير يحتاج إلى مطهر معتمد ومدة تلامس.",
            feedbackEn: "Not right. A dry towel only moves dust around and kills nothing. Decontamination needs an approved disinfectant and contact time.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "وصلت دفعة من عينات البول ومزارع الدم من الأجنحة.",
        contextEn: "A batch of urine specimens and blood cultures has arrived from the wards.",
        promptAr: "اختر كل العينات التي تُقبل للتجهيز.",
        promptEn: "Choose all the specimens that can be accepted for processing.",
        options: [
          {
            textAr: "عينة في وعاء محكم الإغلاق، قائمة، عليها اسم المريض ورقمه الطبي.",
            textEn: "A specimen in a tightly closed, upright container labelled with the patient’s name and medical record number.",
            isCorrect: true,
            stepKey: "specimens-sealed-labelled",
            feedbackAr: "صحيح. الوعاء المحكم غير القابل للتسرب، الموسوم بهوية المريض، هو الحد الأدنى لقبول العينة بأمان.",
            feedbackEn: "Correct. A closed, leak-proof container labelled with the patient’s identity is the minimum for accepting a specimen safely.",
          },
          {
            textAr: "عينة بول تسربت من غطائها إلى كيس النقل.",
            textEn: "A urine specimen that has leaked from its lid into the transport bag.",
            isCorrect: false,
            stepKey: "specimens-sealed-labelled",
            // MEDICAL REVIEW: rejection and decontamination criteria follow each laboratory's own policy.
            feedbackAr:
              "غير صحيح. العينة المسربة مصدر تعرض مباشر، ويُتعامل معها حسب سياسة المختبر (التطهير، أو الرفض وطلب عينة جديدة)، لا بقبولها كأن شيئًا لم يكن.",
            feedbackEn:
              "Not right. A leaking specimen is a direct exposure source. It is handled under the laboratory’s policy (decontamination, or rejection and a request for a new one), not accepted as if nothing happened.",
          },
          {
            textAr: "أنبوب بلا أي وسم؛ يمكنني كتابة الاسم عليه من نموذج الطلب.",
            textEn: "A tube with no label at all; I can write the name on it from the request form.",
            isCorrect: false,
            stepKey: "specimens-sealed-labelled",
            feedbackAr:
              "غير صحيح. وسم عينة لم تأخذها بنفسك قد ينسب نتيجتها إلى مريض آخر. العينة غير الموسومة تُرفض ويُطلب غيرها حسب سياسة المختبر.",
            feedbackEn:
              "Not right. Labelling a specimen you did not collect could attach its result to the wrong patient. An unlabelled specimen is rejected and a new one requested, following laboratory policy.",
          },
          {
            textAr: "زجاجة مزرعة دم مغلقة وموسومة، وصلت قائمة في كيس نقل سليم.",
            textEn: "A closed, labelled blood culture bottle that arrived upright in an intact transport bag.",
            isCorrect: true,
            stepKey: "specimens-sealed-labelled",
            feedbackAr: "صحيح. وصولها مغلقة وموسومة وقائمة في كيس سليم يعني أنها جاهزة للتجهيز بأمان.",
            feedbackEn: "Correct. Arriving closed, labelled and upright in an intact bag means it is ready to be processed safely.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "ازدحمت الطاولة، فوضع زميل العينات المنتظرة على المكتب الإداري بجانب الحاسوب.",
        contextEn: "The bench is crowded, so a colleague has put the waiting specimens on the office desk next to the computer.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أتركها، فالمكتب نظيف والوضع مؤقت.",
            textEn: "I leave them; the desk is clean and it is only temporary.",
            isCorrect: false,
            stepKey: "dedicated-area",
            feedbackAr: "غير صحيح. المكتب الإداري منطقة نظيفة، وأي تسرب أو رذاذ عليه يصل إلى كل من يستخدم الحاسوب.",
            feedbackEn: "Not right. The office desk is a clean area, and any leak or splash there reaches everyone who uses the computer.",
          },
          {
            textAr: "أضعها في ثلاجة الفريق حتى يحين دورها.",
            textEn: "I put them in the staff fridge until their turn.",
            isCorrect: false,
            stepKey: "dedicated-area",
            feedbackAr: "غير صحيح. ثلاجة الفريق للطعام، والعينات فيها تعرّض الطعام للتلوث. تُحفظ العينات في ثلاجة العينات أو منطقتها المحددة فقط.",
            feedbackEn: "Not right. The staff fridge holds food, and specimens in it put that food at risk. Specimens are kept only in the specimen fridge or their marked area.",
          },
          {
            textAr: "أعيدها إلى منطقة العينات المحددة، وأرتب الطاولة لتتسع لها.",
            textEn: "I move them back to the marked specimen area and tidy the bench to make room.",
            isCorrect: true,
            stepKey: "dedicated-area",
            feedbackAr: "صحيح. تبقى العينات في منطقتها المحددة حتى لا ينتقل التلوث إلى المكتب ولوحة المفاتيح والأوراق.",
            feedbackEn: "Correct. Specimens stay in their marked area so contamination does not spread to the desk, the keyboard and the paperwork.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "أثناء العمل ينزلق أنبوب دم من يدك وينكسر على سطح العمل، ويتناثر منه قليل.",
        contextEn: "While you work, a blood tube slips from your hand and breaks on the bench, splashing a little.",
        promptAr: "ما التصرف الصحيح؟",
        promptEn: "What is the right thing to do?",
        options: [
          {
            textAr: "أكمل العينات التي بين يدي، وأنظف السطح في نهاية المناوبة.",
            textEn: "I finish the specimens in hand and clean the bench at the end of the shift.",
            isCorrect: false,
            stepKey: "surface-decontamination",
            feedbackAr: "غير صحيح. العمل فوق انسكاب لم يُطهّر يلوث كل عينة تمر عليه، ويعرّضك للدم والزجاج طوال المناوبة.",
            feedbackEn: "Not right. Working over an untreated spill contaminates every specimen that crosses it and exposes you to blood and glass for the whole shift.",
          },
          {
            textAr: "أتبع إجراء الانسكاب في المختبر: أغطيه وأطهره وأزيل الزجاج بأداة، ثم أطهر السطح قبل أن أكمل.",
            textEn: "I follow the laboratory spill procedure: cover it, disinfect it, remove the glass with a tool, then decontaminate the bench before I carry on.",
            isCorrect: true,
            stepKey: "surface-decontamination",
            feedbackAr: "صحيح. تطهير السطح بعد أي انسكاب وقبل متابعة العمل يمنع وصول التلوث إلى العينات التالية وإلى يديك.",
            feedbackEn: "Correct. Decontaminating the bench after any spill, before you carry on, stops the contamination reaching the next specimens and your hands.",
          },
          {
            textAr: "أمسح الانسكاب بمنديل جاف وأكمل العمل.",
            textEn: "I wipe the spill with a dry towel and carry on.",
            isCorrect: false,
            stepKey: "surface-decontamination",
            feedbackAr: "غير صحيح. المسح الجاف ينشر الدم ولا يطهّر، وقد يجرحك الزجاج المكسور.",
            feedbackEn: "Not right. Dry wiping spreads the blood without disinfecting it, and the broken glass can cut you.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "سقطت لافتة الخطر البيولوجي عن باب المختبر، وصار موظفون من الأجنحة يدخلون للسؤال عن النتائج.",
        contextEn: "The biohazard sign has fallen off the laboratory door, and staff from the wards have started coming in to ask about results.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أعيد تعليق علامة الخطر البيولوجي، وأقصر الدخول على المصرَّح لهم، وأوجّه الاستفسارات إلى نافذة الاستقبال أو الهاتف.",
            textEn: "I put the biohazard sign back up, keep entry to authorised staff and direct enquiries to the reception window or the phone.",
            isCorrect: true,
            stepKey: "biohazard-signage",
            feedbackAr: "صحيح. العلامة تنبه غير المختصين إلى وجود خطر بيولوجي، وتقييد الدخول يحميهم ويحمي العينات (منظمة الصحة العالمية).",
            feedbackEn: "Correct. The sign warns untrained people that a biological hazard is present, and restricting entry protects them and the specimens (WHO).",
          },
          {
            textAr: "لا بأس؛ من يدخلون عاملون صحيون يعرفون المكان.",
            textEn: "It is fine; the people coming in are healthcare workers who know the place.",
            isCorrect: false,
            stepKey: "biohazard-signage",
            feedbackAr: "غير صحيح. العاملون في الأجنحة غير مدرَّبين على مخاطر المختبر، والعلامة وتقييد الدخول يحميانهم من تعرض لا يتوقعونه.",
            feedbackEn: "Not right. Ward staff are not trained in laboratory hazards; the sign and controlled entry protect them from exposure they do not expect.",
          },
        ],
      },
    ],
  },

  // 9 ── food and drink policy ──────────────────────────────────────────────────────────────────────
  {
    slug: "food-on-night-shift",
    protocolSlug: "food-policy",
    titleAr: "طعام في مناوبة الليل",
    titleEn: "Food on the night shift",
    introAr: "في مناوبة ليلية طويلة، أين يُسمح بالأكل والشرب؟ طبق تمر على سطح الأدوية، وعصير بجانب مضخة، وغداء في ثلاجة العينات.",
    introEn: "On a long night shift, where may staff eat and drink? Dates on the medication counter, juice beside a pump and lunch in the specimen fridge.",
    settingAr:
      "مستشفى عام في تبوك، جناح الباطنية والمختبر الملحق به، الساعة الثانية فجرًا. المناوبة طويلة والفريق متعب، وأحضر أحد الزملاء القهوة والتمر للجميع.",
    settingEn:
      "A general hospital in Tabuk, the medical ward and its satellite laboratory, 2 a.m. The shift is long, the team is tired, and a colleague has brought coffee and dates for everyone.",
    difficulty: "beginner",
    estimatedMinutes: 5,
    stages: [
      {
        kind: "single",
        contextAr: "وُضع طبق التمر ودلّة القهوة على سطح تحضير الأدوية في محطة التمريض.",
        contextEn: "The plate of dates and the coffee pot have been put on the medication preparation counter at the nurses’ station.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أتركهما، فمحطة التمريض ليست غرفة مريض.",
            textEn: "I leave them; the nurses’ station is not a patient room.",
            isCorrect: false,
            stepKey: "no-food-patient-areas",
            feedbackAr: "غير صحيح. محطة التمريض وسطح تحضير الأدوية من مناطق العمل السريري، وتنطبق عليهما سياسة منع الطعام.",
            feedbackEn: "Not right. The nurses’ station and the medication counter are clinical work areas, and the food policy applies to them.",
          },
          {
            textAr: "أنقلهما إلى غرفة استراحة الفريق، وأدعو الزملاء إلى هناك.",
            textEn: "I move them to the staff break room and invite colleagues there.",
            isCorrect: true,
            stepKey: "no-food-patient-areas",
            feedbackAr:
              "صحيح. سطح تحضير الأدوية منطقة عمل سريري قد تتلوث، والأكل فيها ينقل الميكروبات من اليد إلى الفم، ويعرّض الأدوية للتلوث أيضًا (معيار OSHA للعوامل الممرضة المنقولة بالدم).",
            feedbackEn:
              "Correct. The medication counter is a clinical work area that may be contaminated; eating there carries microorganisms from hand to mouth and puts the medicines at risk too (OSHA Bloodborne Pathogens Standard).",
          },
          {
            textAr: "آكل بسرعة قبل الجولة القادمة، ثم أمسح السطح.",
            textEn: "I eat quickly before the next round and then wipe the counter.",
            isCorrect: false,
            stepKey: "no-food-patient-areas",
            feedbackAr: "غير صحيح. السرعة لا تقلل خطر نقل الميكروبات إلى فمك؛ فالمشكلة في المكان لا في المدة.",
            feedbackEn: "Not right. Being quick does not lower the risk of carrying microorganisms to your mouth; the problem is the place, not the time.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "في غرفة المريض 5 ترك زميل كوب عصير مفتوحًا بجانب مضخة المحاليل.",
        contextEn: "In patient room 5, a colleague has left an open cup of juice beside the infusion pump.",
        promptAr: "ما التصرف الصحيح؟",
        promptEn: "What is the right thing to do?",
        options: [
          {
            textAr: "أضع غطاءً على الكوب وأتركه بجانب المضخة.",
            textEn: "I put a lid on the cup and leave it next to the pump.",
            isCorrect: false,
            stepKey: "no-food-patient-areas",
            feedbackAr: "غير صحيح. الغطاء يقلل الانسكاب، لكن مشروبات العاملين لا مكان لها في غرفة المريض أصلًا.",
            feedbackEn: "Not right. A lid reduces spills, but staff drinks have no place in a patient room at all.",
          },
          {
            textAr: "أطلب منه نقل الكوب إلى غرفة الاستراحة؛ فلا مشروبات للعاملين في غرف المرضى.",
            textEn: "I ask him to take the cup to the break room; staff drinks do not belong in patient rooms.",
            isCorrect: true,
            stepKey: "no-open-drinks",
            feedbackAr: "صحيح. المشروب المكشوف قد يتلوث بالرذاذ أو ينسكب على المضخة والأدوية، والشرب في غرفة المريض ممنوع على العاملين.",
            feedbackEn: "Correct. An open drink can be contaminated by splashes or spill onto the pump and the medicines, and staff do not drink in patient rooms.",
          },
          {
            textAr: "أتركه، فالمريض نائم ولن يتأثر.",
            textEn: "I leave it; the patient is asleep and won’t be affected.",
            isCorrect: false,
            stepKey: "no-open-drinks",
            feedbackAr: "غير صحيح. الخطر على الأجهزة والأدوية وعلى من سيشرب من الكوب لاحقًا، ولا علاقة له بنوم المريض.",
            feedbackEn: "Not right. The risk is to the equipment, the medicines and whoever drinks from the cup later; it has nothing to do with the patient sleeping.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "تذهب إلى المختبر الملحق لتسليم عينة، فتجد فنيًّا يأكل شطيرة أمام جهاز الطرد المركزي وهو ينتظر النتيجة.",
        contextEn: "You go to the satellite laboratory to hand over a specimen and find a technician eating a sandwich in front of the centrifuge while he waits for a result.",
        promptAr: "ماذا تقول له؟",
        promptEn: "What do you tell him?",
        options: [
          {
            textAr: "لا بأس ما دام غسل يديه قبل الأكل.",
            textEn: "That it is fine, as long as he washed his hands before eating.",
            isCorrect: false,
            isCritical: true,
            stepKey: "no-food-laboratory",
            feedbackAr:
              "خطأ جسيم. الأكل في المختبر ممنوع منعًا تامًّا مهما نُظفت اليدان، لأن الأسطح والهواء قد يحملان ميكروبات العينات، والابتلاع من أخطر طرق التعرض (منظمة الصحة العالمية).",
            feedbackEn:
              "Serious error. Eating in the laboratory is strictly forbidden however clean your hands are, because surfaces and air may carry microorganisms from the specimens, and ingestion is one of the most serious exposure routes (WHO).",
          },
          {
            textAr: "أن يأكل وهو يلبس القفازات، حتى لا يلمس الطعام بيده.",
            textEn: "That he should eat with his gloves on, so his hands don’t touch the food.",
            isCorrect: false,
            isCritical: true,
            stepKey: "no-food-laboratory",
            feedbackAr: "خطأ جسيم. القفازات المستعملة في المختبر ملوثة، والأكل بها ينقل ميكروبات العينات مباشرة إلى الطعام والفم.",
            feedbackEn: "Serious error. Gloves used in the laboratory are contaminated, and eating with them carries microorganisms from the specimens straight to the food and the mouth.",
          },
          {
            textAr: "أن يتوقف، ويخلع وسائل الوقاية، وينظف يديه، ويأكل في غرفة الاستراحة.",
            textEn: "That he should stop, take off his protective equipment, clean his hands and eat in the break room.",
            isCorrect: true,
            stepKey: "no-food-laboratory",
            feedbackAr: "صحيح. يبقى الطعام خارج المختبر تمامًا، والتنبيه اللطيف يحمي زميلك من تعرض قد لا ينتبه إليه.",
            feedbackEn: "Correct. Food stays completely outside the laboratory, and a kind word protects your colleague from an exposure he may not realise.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "عند وضع العينة في ثلاجة العينات تجد علب غداء بجانب أنابيب الدم.",
        contextEn: "When you put the specimen in the specimen fridge, you find lunch boxes next to the blood tubes.",
        promptAr: "اختر كل الإجراءات الصحيحة.",
        promptEn: "Choose all the correct actions.",
        options: [
          {
            textAr: "أنقل الطعام إلى الرف السفلي بعيدًا عن العينات.",
            textEn: "Move the food to the bottom shelf, away from the specimens.",
            isCorrect: false,
            stepKey: "separate-fridge",
            feedbackAr: "غير صحيح. الرف السفلي في الثلاجة نفسها، والتلوث لا يحترم الرفوف. لا يُحفظ الطعام مع العينات أو الأدوية أبدًا.",
            feedbackEn: "Not right. The bottom shelf is in the same fridge, and contamination does not respect shelves. Food is never stored with specimens or medicines.",
          },
          {
            textAr: "أُخرج الطعام وأتخلص منه لأنه قد يكون تلوث، وأبلغ أصحابه والمشرف.",
            textEn: "Take the food out and throw it away, as it may be contaminated, and tell its owners and the supervisor.",
            isCorrect: true,
            stepKey: "separate-fridge",
            feedbackAr: "صحيح. الطعام الذي حُفظ مع العينات قد يكون تلوث، والإبلاغ يمنع تكرار الخطأ.",
            feedbackEn: "Correct. Food kept with specimens may be contaminated, and reporting it stops it happening again.",
          },
          {
            textAr: "أنقل العينات إلى ثلاجة الفريق وأترك الطعام.",
            textEn: "Move the specimens to the staff fridge and leave the food.",
            isCorrect: false,
            stepKey: "separate-fridge",
            feedbackAr: "غير صحيح. هذا ينقل المشكلة إلى ثلاجة الطعام بدل حلها، ويُخرج العينات من مكان حفظها المحدد.",
            feedbackEn: "Not right. That moves the problem into the food fridge instead of solving it, and takes the specimens out of their proper storage.",
          },
          {
            textAr: "أتأكد أن على الثلاجة ملصقًا واضحًا: «للعينات فقط – يُمنع حفظ الطعام».",
            textEn: "Make sure the fridge carries a clear label: “Specimens only – no food”.",
            isCorrect: true,
            stepKey: "separate-fridge",
            feedbackAr: "صحيح. وسم الثلاجة بغرضها يوضح القاعدة لكل من يفتحها.",
            feedbackEn: "Correct. Labelling the fridge with its purpose makes the rule clear to everyone who opens it.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "قرب الفجر، تُحضر عائلة مريض طبقًا من الحلوى للفريق وتضعه على طاولة المريض في الغرفة.",
        contextEn: "Towards dawn, a patient’s family brings a plate of sweets for the team and puts it on the patient’s table in the room.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "آكل قطعة معهم في الغرفة حتى لا أحرجهم.",
            textEn: "I eat a piece with them in the room so as not to offend them.",
            isCorrect: false,
            stepKey: "no-food-patient-areas",
            feedbackAr: "غير صحيح. المجاملة لا تغير خطر الأكل في منطقة رعاية قد تكون أسطحها ملوثة. اشكرهم وتناوله في غرفة الاستراحة.",
            feedbackEn: "Not right. Politeness does not change the risk of eating in a care area whose surfaces may be contaminated. Thank them and eat it in the break room.",
          },
          {
            textAr: "أشكرهم، وأنقل الطبق إلى غرفة استراحة الفريق.",
            textEn: "I thank them and take the plate to the staff break room.",
            isCorrect: true,
            stepKey: "no-food-patient-areas",
            feedbackAr: "صحيح. يمكنك تقدير لطف العائلة مع الالتزام بالسياسة: طعام العاملين مكانه غرفة الاستراحة لا غرفة المريض.",
            feedbackEn: "Correct. You can appreciate the family’s kindness and still follow the policy: staff food belongs in the break room, not the patient’s room.",
          },
          {
            textAr: "أتركه على طاولة المريض ليأخذ منه الفريق متى مرّ.",
            textEn: "I leave it on the patient’s table so the team can help themselves when they pass.",
            isCorrect: false,
            stepKey: "no-food-patient-areas",
            feedbackAr: "غير صحيح. هذا يجعل غرفة المريض مكانًا لأكل العاملين، ويشغل طاولة المريض بما ليس له.",
            feedbackEn: "Not right. That turns the patient’s room into a place where staff eat and fills his table with things that are not his.",
          },
        ],
      },
    ],
  },

  // 10 ── equipment and facility maintenance ─────────────────────────────────────────────────────────
  {
    slug: "faulty-infusion-pump",
    protocolSlug: "maintenance-schedule",
    titleAr: "مضخة محاليل معطلة",
    titleEn: "A faulty infusion pump",
    introAr: "ملصق صيانة منتهٍ، وغلاف مشقوق تسرب إليه سائل، وجدول صيانة قديم: قرّر متى يُستخدم الجهاز ومتى يُعزل.",
    introEn: "An expired service label, a cracked casing with fluid inside and an old maintenance schedule: decide when a device may be used and when it is taken out of service.",
    settingAr:
      "وحدة العناية المتوسطة في مستشفى عام بالقصيم، الساعة الثامنة صباحًا. تحتاج إلى مضخة محاليل لمريض جديد، وفي غرفة الأجهزة ثلاث مضخات.",
    settingEn:
      "The step-down unit of a general hospital in Qassim, 8 a.m. You need an infusion pump for a new patient, and there are three pumps in the equipment room.",
    difficulty: "intermediate",
    estimatedMinutes: 5,
    stages: [
      {
        kind: "single",
        contextAr: "المضخة الأولى تعمل، لكن ملصق الصيانة عليها يشير إلى أن موعد صيانتها التالية كان قبل شهر.",
        contextEn: "The first pump works, but its service label shows its next service was due a month ago.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أستخدمها، فهي تعمل جيدًا.",
            textEn: "I use it; it works fine.",
            isCorrect: false,
            stepKey: "service-labels",
            feedbackAr: "غير صحيح. الجهاز الذي تجاوز موعد صيانته قد يبدو سليمًا وهو غير دقيق أو غير آمن، وملصق الصيانة هو ما يؤكد صلاحيته.",
            feedbackEn: "Not right. A device past its service date may look fine but be inaccurate or unsafe; the service label is what confirms it is fit for use.",
          },
          {
            textAr: "أكتب تاريخًا جديدًا على الملصق بنفسي.",
            textEn: "I write a new date on the label myself.",
            isCorrect: false,
            stepKey: "service-labels",
            feedbackAr: "غير صحيح. تعديل الملصق دون صيانة فعلية يخفي الخطر، ويضلل كل من يستخدم الجهاز بعدك.",
            feedbackEn: "Not right. Changing the label without real servicing hides the risk and misleads everyone who uses the device after you.",
          },
          {
            textAr: "لا أستخدمها، وآخذ مضخة صيانتها سارية، وأبلغ الهندسة الطبية عن الأولى.",
            textEn: "I don’t use it; I take a pump whose service is up to date and report the first one to biomedical engineering.",
            isCorrect: true,
            stepKey: "service-labels",
            feedbackAr: "صحيح. الملصق يتيح لأي عامل التأكد من صلاحية الجهاز قبل استخدامه، والإبلاغ يعيد الجهاز إلى جدول الصيانة (منظمة الصحة العالمية).",
            feedbackEn: "Correct. The label lets any staff member confirm a device is fit before using it, and reporting it gets the device back on schedule (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "غلاف المضخة الثانية مشقوق، ويظهر أثر محلول جاف داخل الشق، وتصدر إنذارًا متقطعًا.",
        contextEn: "The second pump has a cracked casing with dried infusion fluid inside the crack, and it alarms on and off.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أضع عليها بطاقة «خارج الخدمة»، وأبعدها عن منطقة الاستخدام، وأبلغ عنها.",
            textEn: "I tag it “out of service”, move it out of the use area and report it.",
            isCorrect: true,
            stepKey: "tag-out-faulty",
            feedbackAr: "صحيح. البطاقة تمنع زميلًا آخر من استخدام جهاز معطل على مريض، والغلاف المشقوق لا يمكن تنظيفه وتطهيره جيدًا.",
            feedbackEn: "Correct. The tag stops a colleague using a faulty device on a patient, and a cracked casing cannot be cleaned and disinfected properly.",
          },
          {
            textAr: "أمسحها من الخارج وأعيدها إلى الرف.",
            textEn: "I wipe the outside and put it back on the shelf.",
            isCorrect: false,
            stepKey: "tag-out-faulty",
            feedbackAr: "غير صحيح. المسح لا يصلح العطل ولا يصل إلى السائل داخل الشق، وإعادتها إلى الرف تعني أن زميلك التالي سيستخدمها.",
            feedbackEn: "Not right. Wiping fixes neither the fault nor the fluid inside the crack, and putting it back on the shelf means the next colleague will use it.",
          },
          {
            textAr: "أغلق الشق بشريط لاصق، وأستخدمها إن توقف الإنذار.",
            textEn: "I tape over the crack and use it if the alarm stops.",
            isCorrect: false,
            stepKey: "tag-out-faulty",
            feedbackAr: "غير صحيح. الشريط يخفي العطل ولا يصلحه، والإنذار المتقطع علامة خلل قد يغير معدل التسريب للمريض.",
            feedbackEn: "Not right. Tape hides the fault without fixing it, and an intermittent alarm is a sign of a malfunction that could change the patient’s infusion rate.",
          },
        ],
      },
      {
        kind: "multi",
        contextAr: "عزلت المضخة المعطلة، وستبلغ عنها الآن.",
        contextEn: "You have isolated the faulty pump and are about to report it.",
        promptAr: "اختر كل ما يجب فعله عند الإبلاغ.",
        promptEn: "Choose everything you should do when you report it.",
        options: [
          {
            textAr: "أبلغ فورًا عبر نظام طلبات الصيانة المعتمد في المنشأة.",
            textEn: "Report it immediately through the facility’s approved maintenance request system.",
            isCorrect: true,
            stepKey: "report-faults",
            feedbackAr: "صحيح. الإبلاغ الفوري عبر النظام المعتمد يضمن وصول البلاغ وتوثيقه ومتابعته.",
            feedbackEn: "Correct. Reporting at once through the approved system makes sure the report arrives, is recorded and is followed up.",
          },
          {
            textAr: "أنتظر زيارة الهندسة الطبية الشهرية لأخبرهم.",
            textEn: "Wait for biomedical engineering’s monthly visit to tell them.",
            isCorrect: false,
            stepKey: "report-faults",
            feedbackAr: "غير صحيح. التأخر في الإبلاغ يبقي القسم بمضخة أقل ويؤخر الإصلاح، وقد يعود الجهاز إلى الاستخدام في هذه الأثناء.",
            feedbackEn: "Not right. Reporting late leaves the unit a pump short, delays the repair, and the device may drift back into use in the meantime.",
          },
          {
            textAr: "أذكر الرقم التعريفي للجهاز، وأصف العطل بدقة.",
            textEn: "Give the device’s ID number and describe the fault precisely.",
            isCorrect: true,
            stepKey: "report-faults",
            feedbackAr: "صحيح. رقم الجهاز ووصف العطل يساعدان فريق الهندسة الطبية على الإصلاح السريع ورصد الأعطال المتكررة.",
            feedbackEn: "Correct. The device ID and a clear description help biomedical engineering repair it fast and spot repeat faults.",
          },
          {
            textAr: "أخبر المناوبة التالية شفهيًا فقط.",
            textEn: "Tell only the next shift, verbally.",
            isCorrect: false,
            stepKey: "report-faults",
            feedbackAr: "غير صحيح. البلاغ الشفهي يضيع بين المناوبات، ولا يصل إلى من يصلح الجهاز.",
            feedbackEn: "Not right. A verbal message gets lost between shifts and never reaches the people who repair the device.",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "على لوحة الوحدة جدول صيانة الأجهزة، وآخر تحديث له قبل سنة.",
        contextEn: "The unit’s noticeboard shows the equipment maintenance schedule, last updated a year ago.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أتجاهله، فالهندسة الطبية تحتفظ بجدولها الخاص.",
            textEn: "I ignore it; biomedical engineering keeps its own schedule.",
            isCorrect: false,
            stepKey: "schedule-posted",
            feedbackAr: "غير صحيح. الجدول في القسم هو ما يراه العاملون كل يوم، والجدول القديم يعطيهم صورة خاطئة عن الأجهزة المستحقة للصيانة.",
            feedbackEn: "Not right. The schedule in the unit is what staff see every day, and an old one gives them the wrong picture of which devices are due.",
          },
          {
            textAr: "أبلغ مدير الوحدة والهندسة الطبية ليُعلَّق الجدول المحدّث.",
            textEn: "I tell the unit manager and biomedical engineering so the current schedule is posted.",
            isCorrect: true,
            stepKey: "schedule-posted",
            feedbackAr: "صحيح. الجدول المحدّث الظاهر يوضح المسؤوليات والمواعيد ويمنع نسيان الصيانة الدورية (منظمة الصحة العالمية).",
            feedbackEn: "Correct. An up-to-date, visible schedule makes responsibilities and dates clear and stops routine maintenance being forgotten (WHO).",
          },
        ],
      },
      {
        kind: "single",
        contextAr: "بعد ساعة تجد المضخة المعطلة على الرف مرة أخرى، وقد نُزعت عنها بطاقة «خارج الخدمة».",
        contextEn: "An hour later you find the faulty pump back on the shelf, with its “out of service” tag removed.",
        promptAr: "ماذا تفعل؟",
        promptEn: "What do you do?",
        options: [
          {
            textAr: "أتركها؛ ربما أصلحها أحد.",
            textEn: "I leave it; perhaps someone repaired it.",
            isCorrect: false,
            stepKey: "tag-out-faulty",
            feedbackAr: "غير صحيح. الجهاز المصلَح يعود بملصق صيانة جديد من الهندسة الطبية، لا بمجرد نزع البطاقة. افترض أنه ما زال معطلًا.",
            feedbackEn: "Not right. A repaired device comes back with a new service label from biomedical engineering, not just with the tag gone. Assume it is still faulty.",
          },
          {
            textAr: "أستخدمها لمريض مستقر فقط.",
            textEn: "I use it only for a stable patient.",
            isCorrect: false,
            stepKey: "tag-out-faulty",
            feedbackAr: "غير صحيح. الجهاز المعطل غير آمن لأي مريض، واستقرار المريض لا يجعل خطأ معدل التسريب أقل ضررًا.",
            feedbackEn: "Not right. A faulty device is unsafe for any patient; a stable patient does not make a wrong infusion rate any less harmful.",
          },
          {
            textAr: "أعيد وسمها، وأنقلها إلى منطقة الأجهزة المعطلة، وأخبر مسؤول المناوبة بما حدث.",
            textEn: "I tag it again, move it to the faulty-equipment area and tell the shift lead what happened.",
            isCorrect: true,
            stepKey: "tag-out-faulty",
            feedbackAr: "صحيح. يبقى الجهاز المعطل معزولًا وموسومًا حتى يُصلح، وإبلاغ المسؤول يمنع تكرار نزع البطاقة.",
            feedbackEn: "Correct. A faulty device stays isolated and tagged until it is repaired, and telling the shift lead stops the tag being removed again.",
          },
        ],
      },
    ],
  },
];
