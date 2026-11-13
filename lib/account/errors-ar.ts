import type { TranslationDictionary } from "@better-auth/i18n";

// Arabic for the Better Auth error codes the account features can return (lib/auth.ts merges this after
// lib/auth-errors-ar.ts). English falls back to Better Auth's own English text or the message we throw.
export const accountErrorsAr = {
  // Waqaya codes thrown from lib/auth.ts hooks
  ACCOUNT_DELETION_BLOCKED: "لا يمكن حذف هذا الحساب الآن.",
  NOT_WHILE_IMPERSONATING: "لا يمكن ذلك وأنت تتصفح بصفة مستخدم آخر.",
  FIELD_NOT_ALLOWED: "لا يمكن تعديل هذا الحقل من هنا.",
  ROLE_NOT_ALLOWED: "هذا الدور غير متاح. الأدوار المتاحة: مستخدم أو مشرف المنصة.",
  LAST_PLATFORM_ADMIN: "هذا آخر مشرف نشط للمنصة. عيّن مشرفًا آخر أولًا.",
  ACCOUNT_LOCK_BUSY: "هناك تغيير آخر قيد التنفيذ. أعد المحاولة بعد قليل.",
  // Institution and settings gates (lib/org/auth-gates.ts, lib/settings-feature/auth-gates.ts)
  INVALID_INPUT: "بعض البيانات المدخلة غير صحيحة. راجعها ثم حاول مرة أخرى.",
  DEPARTMENT_NAME_TAKEN: "يوجد قسم بهذا الاسم في المؤسسة.",
  YOU_ARE_NOT_ALLOWED_TO_VIEW_THIS: "لا تملك صلاحية الاطلاع على هذه البيانات.",
  // Better Auth core codes whose bundled Arabic reads poorly
  INVALID_PASSWORD: "كلمة المرور غير صحيحة.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "لا توجد كلمة مرور لهذا الحساب.",
  SESSION_EXPIRED: "انتهت الجلسة. سجّل الدخول من جديد ثم أعد المحاولة.",
} satisfies TranslationDictionary;
