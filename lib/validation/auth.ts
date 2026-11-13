import * as z from "zod";

// Shared auth form schemas (client forms; admin user creation can reuse them). No inline messages:
// errors come from lib/zod-i18n.ts zodErrorMap. Keep the limits in sync with lib/auth.ts.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailField = z.string().trim().min(1).max(254).pipe(z.email());
export const passwordField = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
export const otpField = z.string().refine((v) => /^\d{6}$/.test(v), { params: { i18n: "otp" } });

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailField,
  password: passwordField,
  profession: z.string().trim().max(100),
});

export const verifyEmailSchema = z.object({
  email: emailField,
  otp: otpField,
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    email: emailField,
    otp: otpField,
    password: passwordField,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    params: { i18n: "passwordsMismatch" },
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX),
    newPassword: passwordField,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    params: { i18n: "passwordsMismatch" },
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    params: { i18n: "passwordSameAsCurrent" },
  });

export type SignInValues = z.input<typeof signInSchema>;
export type SignUpValues = z.input<typeof signUpSchema>;
