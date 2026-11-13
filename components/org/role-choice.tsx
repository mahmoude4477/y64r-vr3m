"use client";

import { useTranslations } from "next-intl";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { OrgRole } from "@/lib/permissions";
import { rolesForPicker } from "@/lib/org/roles";
import { RoleIcon } from "./role-badge";

/**
 * The role picker of the invite and change-role dialogs: one card per role with what the role can do, the most common
 * role (trainee) first. `current` marks the member's present role in the change-role dialog.
 */
export function RoleChoice({
  id,
  legend,
  roles,
  value,
  onChange,
  current,
}: {
  id: string;
  legend: string;
  roles: readonly OrgRole[];
  value: OrgRole;
  onChange: (role: OrgRole) => void;
  current?: OrgRole | null;
}) {
  const names = useTranslations("common.roles");
  const descriptions = useTranslations("org.roleDescriptions");
  const t = useTranslations("org.members.changeRole");
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as OrgRole)}>
        {rolesForPicker(roles).map((role) => (
          <FieldLabel key={role} htmlFor={`${id}-${role}`}>
            <Field orientation="horizontal">
              <RadioGroupItem value={role} id={`${id}-${role}`} />
              <FieldContent>
                <FieldTitle>
                  <RoleIcon role={role} className="size-4 text-muted-foreground" />
                  {names(role)}
                  {current === role && <span className="font-normal text-muted-foreground">({t("current")})</span>}
                </FieldTitle>
                <FieldDescription>{descriptions(role)}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
