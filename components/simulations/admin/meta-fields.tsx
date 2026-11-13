"use client";

import { useTranslations } from "next-intl";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LIMITS } from "@/lib/simulations/admin/content";
import { DIFFICULTIES, isDifficulty } from "@/lib/simulations/engine";
import { BilingualFields, fieldId } from "./form-fields";

export type MetaProtocol = { id: string; title: string; isPublished: boolean; organizationId: string | null };

/**
 * The scenario's basics (title, introduction, situation, protocol, level, minutes), shared by the create form and the
 * editor. `protocols` is already limited to what the owner may use.
 */
export function MetaFields<T extends FieldValues>({
  control,
  protocols,
  onProtocolChange,
}: {
  control: Control<T>;
  protocols: MetaProtocol[];
  /** Runs before the new value is set (the editor clears step links of the old protocol). */
  onProtocolChange?: (next: string) => void;
}) {
  const t = useTranslations("simulations.admin.fields");
  return (
    <div className="flex flex-col gap-5">
      <BilingualFields control={control} base="title" labels={{ ar: t("titleAr"), en: t("titleEn") }} maxLength={LIMITS.title} />
      <BilingualFields
        control={control}
        base="intro"
        labels={{ ar: t("introAr"), en: t("introEn") }}
        description={t("introHint")}
        multiline
        rows={2}
        maxLength={LIMITS.intro}
      />
      <BilingualFields
        control={control}
        base="setting"
        labels={{ ar: t("settingAr"), en: t("settingEn") }}
        description={t("settingHint")}
        multiline
        rows={4}
        maxLength={LIMITS.setting}
      />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <ProtocolSelect control={control} protocols={protocols} onProtocolChange={onProtocolChange} />
        <DifficultySelect control={control} />
        <MinutesField control={control} />
      </div>
    </div>
  );
}

function ProtocolSelect<T extends FieldValues>({
  control,
  protocols,
  onProtocolChange,
}: {
  control: Control<T>;
  protocols: MetaProtocol[];
  onProtocolChange?: (next: string) => void;
}) {
  const t = useTranslations("simulations.admin.fields");
  const name = "protocolId" as FieldPath<T>;
  const id = fieldId(name);
  const label = (p: MetaProtocol) => (p.isPublished ? p.title : t("protocolDraft", { title: p.title }));
  const items = protocols.map((p) => ({ value: p.id, label: label(p) }));
  const global = protocols.filter((p) => p.organizationId === null);
  const own = protocols.filter((p) => p.organizationId !== null);
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{t("protocol")}</FieldLabel>
          <Select
            items={items}
            value={(field.value as string) || null}
            onValueChange={(next) => {
              if (typeof next !== "string" || next === field.value) return;
              onProtocolChange?.(next);
              field.onChange(next);
            }}
          >
            <SelectTrigger
              id={id}
              ref={field.ref}
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={`${id}-hint`}
              className="w-full min-w-0"
            >
              <SelectValue placeholder={t("protocolPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {own.length > 0 ? (
                <>
                  <SelectGroup>
                    <SelectLabel>{t("protocolGlobal")}</SelectLabel>
                    {global.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {label(p)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t("protocolInstitution")}</SelectLabel>
                    {own.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {label(p)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              ) : (
                global.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {label(p)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <FieldDescription id={`${id}-hint`}>{t("protocolHint")}</FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

function DifficultySelect<T extends FieldValues>({ control }: { control: Control<T> }) {
  const t = useTranslations("simulations.admin.fields");
  const td = useTranslations("common.difficulty");
  const name = "difficulty" as FieldPath<T>;
  const id = fieldId(name);
  const items = DIFFICULTIES.map((d) => ({ value: d, label: td(d) }));
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{t("difficulty")}</FieldLabel>
          <Select
            items={items}
            value={field.value as string}
            onValueChange={(next) => {
              if (isDifficulty(next)) field.onChange(next);
            }}
          >
            <SelectTrigger id={id} ref={field.ref} onBlur={field.onBlur} className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

function MinutesField<T extends FieldValues>({ control }: { control: Control<T> }) {
  const t = useTranslations("simulations.admin.fields");
  const name = "estimatedMinutes" as FieldPath<T>;
  const id = fieldId(name);
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{t("minutes")}</FieldLabel>
          <Input
            id={id}
            ref={field.ref}
            name={field.name}
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={LIMITS.minMinutes}
            max={LIMITS.maxMinutes}
            step={1}
            value={field.value === undefined || Number.isNaN(field.value) ? "" : String(field.value)}
            onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid || undefined}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
