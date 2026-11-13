"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon, Building2Icon, ChevronsUpDownIcon, CircleAlertIcon, GlobeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { createScenarioAction } from "@/lib/simulations/admin/actions";
import { createScenarioSchema, type CreateScenarioValues, LIMITS, slugify } from "@/lib/simulations/admin/content";
import { withScenarioIssues } from "@/lib/simulations/admin/error-map";
import type { CreateOptions } from "@/lib/simulations/admin/queries";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { cn } from "@/lib/utils";
import { useAdminErrorText } from "./errors";
import { fieldId } from "./form-fields";
import { MetaFields } from "./meta-fields";

type OwnerKind = "global" | "institution";

/**
 * Step 1 of a new scenario: owner, protocol and basics. It creates an unpublished draft and opens the editor, where the
 * stages are added (a long form is never lost to a single failed submit).
 */
export function CreateScenarioForm({ options }: { options: CreateOptions }) {
  const t = useTranslations("simulations.admin.create");
  const ti = useTranslations("simulations.admin.issues");
  const locale = useLocale();
  const router = useRouter();
  const baseMap = useZodErrorMap();
  const errorMap = useMemo(() => withScenarioIssues(baseMap, (key) => ti(key)), [baseMap, ti]);
  const errorText = useAdminErrorText();
  const [ownerKind, setOwnerKind] = useState<OwnerKind>("global");
  const [formError, setFormError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const slugTouched = useRef(false);

  const form = useForm<CreateScenarioValues>({
    resolver: zodResolver(createScenarioSchema, { error: errorMap }),
    defaultValues: {
      titleAr: "",
      titleEn: "",
      introAr: "",
      introEn: "",
      settingAr: "",
      settingEn: "",
      protocolId: "",
      difficulty: "beginner",
      estimatedMinutes: 5,
      slug: "",
      organizationId: null,
    },
  });
  const organizationId = useWatch({ control: form.control, name: "organizationId" });
  const titleEn = useWatch({ control: form.control, name: "titleEn" });

  // The address follows the English title until the admin edits it.
  useEffect(() => {
    if (!slugTouched.current) form.setValue("slug", slugify(titleEn ?? ""), { shouldValidate: form.formState.isSubmitted });
  }, [form, titleEn]);

  const protocols = options.protocols.filter((p) => p.organizationId === null || (ownerKind === "institution" && p.organizationId === organizationId));

  function changeOwner(kind: OwnerKind) {
    setOwnerKind(kind);
    if (kind === "global") form.setValue("organizationId", null);
    const current = form.getValues("protocolId");
    const stillAllowed = options.protocols.some((p) => p.id === current && p.organizationId === null);
    if (current && !stillAllowed) form.setValue("protocolId", "");
  }

  function changeInstitution(id: string) {
    form.setValue("organizationId", id, { shouldValidate: false });
    form.clearErrors("organizationId");
    const current = form.getValues("protocolId");
    const allowed = options.protocols.some((p) => p.id === current && (p.organizationId === null || p.organizationId === id));
    if (current && !allowed) form.setValue("protocolId", "");
  }

  async function onSubmit(values: CreateScenarioValues) {
    setFormError(null);
    if (ownerKind === "institution" && !values.organizationId) {
      form.setError("organizationId", { message: t("institutionRequired") }, { shouldFocus: true });
      return;
    }
    try {
      const result = await createScenarioAction(locale, values);
      if (!result.ok) {
        if (result.error === "slug_taken") {
          form.setError("slug", { message: errorText("slug_taken") }, { shouldFocus: true });
          return;
        }
        for (const issue of result.fieldIssues ?? []) form.setError(issue.path as keyof CreateScenarioValues, { message: issue.message });
        setFormError(errorText(result.error));
        return;
      }
      setNavigating(true);
      toast.success(t("created"));
      router.push(`/admin/scenarios/${result.id}`);
    } catch {
      setFormError(errorText("network"));
    }
  }

  const submitting = form.formState.isSubmitting || navigating;
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, () => {
        if (ownerKind === "institution" && !form.getValues("organizationId")) form.setError("organizationId", { message: t("institutionRequired") });
      })}
      noValidate
      className="flex flex-col gap-6"
    >
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <FieldSet>
          <FieldLegend>{t("ownerLegend")}</FieldLegend>
          <FieldDescription>{t("ownerFixed")}</FieldDescription>
          <RadioGroup value={ownerKind} onValueChange={(v) => changeOwner(v === "institution" ? "institution" : "global")} className="grid gap-3 sm:grid-cols-2">
            <OwnerChoice value="global" icon={GlobeIcon} title={t("ownerGlobal")} hint={t("ownerGlobalHint")} />
            <OwnerChoice
              value="institution"
              icon={Building2Icon}
              title={t("ownerInstitution")}
              hint={t("ownerInstitutionHint")}
              disabled={options.institutions.length === 0}
            />
          </RadioGroup>
          {options.institutions.length === 0 && <p className="text-sm text-muted-foreground">{t("noInstitutions")}</p>}
        </FieldSet>
        {ownerKind === "institution" && (
          <Controller
            name="organizationId"
            control={form.control}
            render={({ field, fieldState }) => (
              <InstitutionCombobox
                institutions={options.institutions}
                value={field.value ?? null}
                onChange={changeInstitution}
                triggerRef={field.ref}
                error={fieldState.error?.message}
              />
            )}
          />
        )}
      </section>

      <section className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-5">
        <MetaFields control={form.control} protocols={protocols} />
        <Controller
          name="slug"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor={fieldId("slug")}>{t("slug")}</FieldLabel>
              <Input
                id={fieldId("slug")}
                {...field}
                onChange={(e) => {
                  slugTouched.current = true;
                  field.onChange(e.target.value.toLowerCase());
                }}
                dir="ltr"
                lang="en"
                autoComplete="off"
                spellCheck={false}
                maxLength={LIMITS.slug}
                className="font-mono"
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={`${fieldId("slug")}-hint`}
              />
              <FieldDescription id={`${fieldId("slug")}-hint`}>
                {t.rich("slugHint", {
                  slug: field.value || "…",
                  path: (chunks) => (
                    <bdi dir="ltr" className="font-mono">
                      {chunks}
                    </bdi>
                  ),
                })}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </section>

      {formError && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? <Spinner aria-hidden /> : <ArrowRightIcon aria-hidden className="rtl:rotate-180" />}
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

function OwnerChoice({
  value,
  icon: Icon,
  title,
  hint,
  disabled,
}: {
  value: OwnerKind;
  icon: typeof GlobeIcon;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <FieldLabel htmlFor={id} className={cn("w-full", disabled && "opacity-60")}>
      <Field orientation="horizontal" className="items-start gap-3 p-3!">
        {/* Named in the server HTML too: Base UI finds a wrapping label only after hydration. */}
        <RadioGroupItem value={value} id={id} disabled={disabled} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} />
        <FieldContent>
          <FieldTitle id={`${id}-title`} className="inline-flex items-center gap-1.5">
            <Icon aria-hidden className="size-4 text-muted-foreground" />
            {title}
          </FieldTitle>
          <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

/** A searchable list of institutions (there can be many): a button that opens a filtered listbox. */
function InstitutionCombobox({
  institutions,
  value,
  onChange,
  triggerRef,
  error,
}: {
  institutions: CreateOptions["institutions"];
  value: string | null;
  onChange: (id: string) => void;
  triggerRef: React.Ref<HTMLButtonElement>;
  error?: string;
}) {
  const t = useTranslations("simulations.admin.create");
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const errorId = useId();
  const selected = institutions.find((i) => i.id === value) ?? null;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel id={labelId} htmlFor={fieldId("organizationId")}>
        {t("institution")}
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              ref={triggerRef}
              id={fieldId("organizationId")}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? <bdi>{selected.name}</bdi> : t("institutionPlaceholder")}
          </span>
          <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-0">
          <Command>
            <CommandInput placeholder={t("institutionSearch")} aria-label={t("institutionSearch")} />
            <CommandList aria-labelledby={labelId}>
              <CommandEmpty>{t("institutionEmpty")}</CommandEmpty>
              <CommandGroup>
                {institutions.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={`${i.name} ${i.slug} ${i.id}`}
                    data-checked={i.id === value}
                    onSelect={() => {
                      onChange(i.id);
                      setOpen(false);
                    }}
                  >
                    <bdi className="truncate">{i.name}</bdi>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
