"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { errorOf, useAdminAction } from "@/components/admin/use-admin-action";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { SettingSource } from "@/lib/admin/ai-display";
import { resetAiSettingAction, updateAiSettingAction } from "@/lib/admin/ai-actions";
import {
  AI_DAILY_LIMIT_MAX,
  AI_EFFORT_OPTIONS,
  AI_MODEL_MAX,
  aiDailyLimitFormSchema,
  aiEffortFormSchema,
  aiModelFormSchema,
  type AiDailyLimitFormValues,
  type AiEffortFormValues,
  type AiModelFormValues,
  type AiSettingKey,
} from "@/lib/admin/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";

export type SettingState<T> = {
  value: T;
  source: SettingSource;
  updatedAt: string | null;
  updatedByName: string | null;
};

/** Where the current value comes from, and since when (panel values). */
function SourceLine({ state }: { state: SettingState<unknown> }) {
  const t = useTranslations("admin.ai.settings");
  const format = useFormatter();
  if (state.source === "panel") {
    const date = state.updatedAt ? format.dateTime(new Date(state.updatedAt), "dateTime") : "";
    return (
      <p className="text-xs text-muted-foreground">
        {state.updatedByName ? t("source.panelBy", { date, name: state.updatedByName }) : t("source.panel", { date })}
      </p>
    );
  }
  return <p className="text-xs text-muted-foreground">{state.source === "environment" ? t("source.environment") : t("source.default")}</p>;
}

/** "Back to the server default": removes the panel value (only shown while there is one). */
function ResetButton({ settingKey, label }: { settingKey: AiSettingKey; label: string }) {
  const t = useTranslations("admin.ai.settings");
  const run = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <RotateCcwIcon aria-hidden />
        {t("reset")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("resetTitle", { name: label })}
        description={t("resetDescription")}
        confirmLabel={t("reset")}
        onConfirm={async () => errorOf(await run(resetAiSettingAction, { key: settingKey }, t("resetDone")))}
      />
    </>
  );
}

function SettingBlock({
  title,
  description,
  current,
  state,
  settingKey,
  children,
}: {
  title: string;
  description: string;
  current: React.ReactNode;
  state: SettingState<unknown>;
  settingKey: AiSettingKey;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.ai.settings");
  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0" aria-labelledby={`setting-${settingKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`setting-${settingKey}`} className="text-sm font-semibold">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {state.source === "panel" && <ResetButton settingKey={settingKey} label={title} />}
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2">
        <p className="text-sm">
          <span className="text-muted-foreground">{t("current")}: </span>
          <span className="font-medium">{current}</span>
        </p>
        <SourceLine state={state} />
      </div>
      {children}
    </section>
  );
}

function SaveButton({ submitting, disabled }: { submitting: boolean; disabled: boolean }) {
  const t = useTranslations("admin.ai.settings");
  return (
    <Button type="submit" disabled={submitting || disabled} className="self-start">
      {submitting && <Spinner />}
      {t("save")}
    </Button>
  );
}

function ModelForm({ state, hasPrice }: { state: SettingState<string>; hasPrice: boolean }) {
  const t = useTranslations("admin.ai.settings");
  const run = useAdminAction();
  const errorMap = useZodErrorMap();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<AiModelFormValues>({
    resolver: zodResolver(aiModelFormSchema, { error: errorMap }),
    defaultValues: { model: state.value },
  });
  const model = useWatch({ control: form.control, name: "model" });
  async function submit(values: AiModelFormValues) {
    setError(null);
    const parsed = aiModelFormSchema.parse(values);
    const failure = errorOf(await run(updateAiSettingAction, { key: "ai.model", value: parsed.model }, t("saved")));
    if (failure) setError(failure);
    else form.reset({ model: parsed.model });
  }
  return (
    <SettingBlock
      title={t("model.title")}
      description={t("model.description")}
      settingKey="ai.model"
      state={state}
      current={
        <code dir="ltr" className="font-mono">
          {state.value}
        </code>
      }
    >
      {!hasPrice && (
        <p className="flex items-start gap-2 text-sm text-[color-mix(in_oklab,var(--warning),var(--foreground)_50%)] dark:text-warning">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("model.noPrice")}
        </p>
      )}
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-2">
        <Controller
          name="model"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="ai-model">{t("model.label")}</FieldLabel>
              <Input
                id="ai-model"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                maxLength={AI_MODEL_MAX}
                className="font-mono sm:max-w-sm"
                aria-invalid={fieldState.invalid}
                aria-describedby="ai-model-hint"
                {...field}
              />
              <FieldDescription id="ai-model-hint">
                {t.rich("model.hint", {
                  code: (chunks) => (
                    <code dir="ltr" className="font-mono">
                      {chunks}
                    </code>
                  ),
                })}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <FormError message={error} />
        <SaveButton submitting={form.formState.isSubmitting} disabled={model.trim().toLowerCase() === state.value} />
      </form>
    </SettingBlock>
  );
}

function EffortForm({ state }: { state: SettingState<string> }) {
  const t = useTranslations("admin.ai.settings");
  const run = useAdminAction();
  const errorMap = useZodErrorMap();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<AiEffortFormValues>({
    resolver: zodResolver(aiEffortFormSchema, { error: errorMap }),
    defaultValues: { effort: state.value as AiEffortFormValues["effort"] },
  });
  const effort = useWatch({ control: form.control, name: "effort" });
  const items = Object.fromEntries(AI_EFFORT_OPTIONS.map((e) => [e, t(`effort.levels.${e}`)]));
  async function submit(values: AiEffortFormValues) {
    setError(null);
    const failure = errorOf(await run(updateAiSettingAction, { key: "ai.effort", value: values.effort }, t("saved")));
    if (failure) setError(failure);
    else form.reset(values);
  }
  return (
    <SettingBlock
      title={t("effort.title")}
      description={t("effort.description")}
      settingKey="ai.effort"
      state={state}
      current={(AI_EFFORT_OPTIONS as readonly string[]).includes(state.value) ? items[state.value] : state.value}
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-2">
        <Controller
          name="effort"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="ai-effort">{t("effort.label")}</FieldLabel>
              <Select items={items} value={field.value} onValueChange={(v) => field.onChange(v ?? state.value)}>
                <SelectTrigger id="ai-effort" className="w-full sm:w-64" aria-invalid={fieldState.invalid} onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_EFFORT_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {items[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t(`effort.hints.${effort}`)}</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <FormError message={error} />
        <SaveButton submitting={form.formState.isSubmitting} disabled={effort === state.value} />
      </form>
    </SettingBlock>
  );
}

function DailyLimitForm({ state, defaultLimit }: { state: SettingState<number>; defaultLimit: number }) {
  const t = useTranslations("admin.ai.settings");
  const format = useFormatter();
  const run = useAdminAction();
  const errorMap = useZodErrorMap();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState(String(state.value));
  const form = useForm<AiDailyLimitFormValues>({
    resolver: zodResolver(aiDailyLimitFormSchema, { error: errorMap }),
    defaultValues: { limit: state.value },
  });
  const limit = useWatch({ control: form.control, name: "limit" });
  async function submit(values: AiDailyLimitFormValues) {
    setError(null);
    const failure = errorOf(await run(updateAiSettingAction, { key: "ai.dailyLimitPerUser", value: values.limit }, t("saved")));
    if (failure) setError(failure);
    else form.reset(values);
  }
  return (
    <SettingBlock
      title={t("limit.title")}
      description={t("limit.description")}
      settingKey="ai.dailyLimitPerUser"
      state={state}
      current={state.value === 0 ? t("limit.off") : t("limit.value", { n: format.number(state.value, "integer") })}
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-2">
        <Controller
          name="limit"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="ai-limit">{t("limit.label")}</FieldLabel>
              <Input
                id="ai-limit"
                type="number"
                inputMode="numeric"
                min={0}
                max={AI_DAILY_LIMIT_MAX}
                step={1}
                dir="ltr"
                className="w-full sm:w-40"
                aria-invalid={fieldState.invalid}
                aria-describedby="ai-limit-hint"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  field.onChange(e.target.value.trim() === "" ? Number.NaN : Number(e.target.value));
                }}
              />
              <FieldDescription id="ai-limit-hint">{t("limit.hint", { n: format.number(defaultLimit, "integer") })}</FieldDescription>
              {limit === 0 && (
                <p className="flex items-start gap-2 text-sm text-[color-mix(in_oklab,var(--warning),var(--foreground)_50%)] dark:text-warning">
                  <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t("limit.zeroWarning")}
                </p>
              )}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <FormError message={error} />
        <SaveButton submitting={form.formState.isSubmitting} disabled={limit === state.value} />
      </form>
    </SettingBlock>
  );
}

/** The three AI settings of the platform, each saved on its own (and audited as setting.update). */
export function AiSettingsForms({
  model,
  effort,
  dailyLimit,
  defaultDailyLimit,
  modelHasPrice,
}: {
  model: SettingState<string>;
  effort: SettingState<string>;
  dailyLimit: SettingState<number>;
  defaultDailyLimit: number;
  modelHasPrice: boolean;
}) {
  // key: a saved value comes back from the server as the new default of each form.
  return (
    <div className="flex flex-col divide-y">
      <ModelForm key={`m-${model.value}-${model.source}`} state={model} hasPrice={modelHasPrice} />
      <EffortForm key={`e-${effort.value}-${effort.source}`} state={effort} />
      <DailyLimitForm key={`l-${dailyLimit.value}-${dailyLimit.source}`} state={dailyLimit} defaultLimit={defaultDailyLimit} />
    </div>
  );
}
