"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  EllipsisVerticalIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserMinusIcon,
  UserPlusIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import type { OrgDepartmentRow } from "@/lib/org/queries";
import {
  DEPARTMENT_NAME_MAX,
  departmentSchema,
  type DepartmentValues,
  normalizeDepartmentName,
  sameDepartmentName,
} from "@/lib/org/schemas";
import { useZodErrorMap } from "@/lib/use-zod-error-map";
import { ConfirmDialog } from "./confirm-dialog";
import { DIALOG_CONTENT, STICKY_FOOTER, TAP_SM } from "./dialog-styles";
import { InitialsAvatar } from "./initials-avatar";
import { NameText, nameTextProps } from "./name-text";
import { callAuth, useOrgErrorText } from "./use-org-error";

export type DepartmentPerson = { userId: string; name: string; email: string };

type OpenDialog =
  | { kind: "create" }
  | { kind: "rename"; departmentId: string }
  | { kind: "delete"; departmentId: string }
  | { kind: "members"; departmentId: string }
  | null;

const AVATARS = 5;
/** The list heading: focus goes there when a deleted department's card (and its menu button) goes away. */
const LIST_HEADING_ID = "departments-title";

/** An address on its own line: left-to-right, cut at its end (never its start), aligned with the page's start side. */
const EMAIL_LINE = "truncate text-left text-xs text-muted-foreground rtl:text-right";

/**
 * /org/departments (client island). Departments are Better Auth teams: create-team, update-team, remove-team,
 * add-team-member and remove-team-member enforce the permissions (owner / admin) and lib/auth.ts audits them.
 * Examiners see the same cards read-only.
 */
export function DepartmentsManager({
  organizationId,
  canManage,
  canDeleteLast,
  departments,
  people,
  openCreate,
}: {
  organizationId: string;
  canManage: boolean;
  /** The server lets an institution delete its last department (lib/org/capabilities.ts). */
  canDeleteLast: boolean;
  departments: OrgDepartmentRow[];
  people: DepartmentPerson[];
  openCreate: boolean;
}) {
  const t = useTranslations("org.departments");
  const format = useFormatter();
  const locale = useLocale();
  const [dialog, setDialogState] = useState<OpenDialog>(canManage && openCreate ? { kind: "create" } : null);
  // Bumped on every open: the form dialog remounts with fresh values (no reset during render or in an effect).
  const [openCount, setOpenCount] = useState(0);
  // The department the create/rename form is about (kept while the dialog animates out); null = create.
  const [formFor, setFormFor] = useState<string | null>(null);
  const setDialog = (next: OpenDialog) => {
    if (next) setOpenCount((n) => n + 1);
    if (next?.kind === "create") setFormFor(null);
    if (next?.kind === "rename") setFormFor(next.departmentId);
    setDialogState(next);
  };
  const [lastDepartmentId, setLastDepartmentId] = useState<string | null>(null);

  // ?create=1 (from the overview's first steps) opens the dialog once; drop it from the address bar.
  useEffect(() => {
    if (!openCreate) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("create")) {
      url.searchParams.delete("create");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, [openCreate]);

  const sorted = useMemo(() => {
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    return [...departments].sort((a, b) => collator.compare(a.name, b.name));
  }, [departments, locale]);

  const openId = dialog && dialog.kind !== "create" ? dialog.departmentId : null;
  if (openId && openId !== lastDepartmentId) setLastDepartmentId(openId);
  // The department the open dialog is about (the last one while it animates out); fresh after every refresh.
  const current = departments.find((d) => d.id === (openId ?? lastDepartmentId)) ?? null;
  // Better Auth keeps an institution's last department unless the server allows removing all of them.
  const deletable = canDeleteLast || departments.length > 1;

  return (
    <section aria-labelledby={LIST_HEADING_ID} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id={LIST_HEADING_ID} tabIndex={-1} className="text-lg font-semibold outline-none">
            {t("listTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("count", { count: departments.length, n: format.number(departments.length, "integer") })}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon aria-hidden />
            {t("create")}
          </Button>
        )}
      </div>
      {!canManage && <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{t("readOnly")}</p>}

      {sorted.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NetworkIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{canManage ? t("emptyManager") : t("emptyViewer")}</EmptyDescription>
          </EmptyHeader>
          {canManage && (
            <EmptyContent>
              <Button onClick={() => setDialog({ kind: "create" })}>
                <PlusIcon aria-hidden />
                {t("create")}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ul aria-labelledby={LIST_HEADING_ID} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((d) => (
            <li key={d.id}>
              <DepartmentCard
                department={d}
                canManage={canManage}
                deletable={deletable}
                onMembers={() => setDialog({ kind: "members", departmentId: d.id })}
                onRename={() => setDialog({ kind: "rename", departmentId: d.id })}
                onDelete={() => setDialog({ kind: "delete", departmentId: d.id })}
              />
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <DepartmentFormDialog
          key={openCount}
          open={dialog?.kind === "create" || dialog?.kind === "rename"}
          department={formFor ? (departments.find((d) => d.id === formFor) ?? null) : null}
          organizationId={organizationId}
          departments={departments}
          onClose={() => setDialog(null)}
        />
      )}
      {canManage && (
        <DeleteDepartmentDialog
          open={dialog?.kind === "delete"}
          department={current}
          organizationId={organizationId}
          onClose={() => setDialog(null)}
        />
      )}
      <DepartmentMembersDialog
        open={dialog?.kind === "members"}
        department={current}
        organizationId={organizationId}
        canManage={canManage}
        people={people}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}

function DepartmentCard({
  department: d,
  canManage,
  deletable,
  onMembers,
  onRename,
  onDelete,
}: {
  department: OrgDepartmentRow;
  canManage: boolean;
  deletable: boolean;
  onMembers: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("org.departments");
  const format = useFormatter();
  const count = d.members.length;
  const extra = count - AVATARS;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          {/* The heading keeps the page's direction (an Arabic name on an English page stays at the start side, R2-UX-6);
              the name itself is isolated inside it. */}
          <h3 className="break-words">
            <NameText>{d.name}</NameText>
          </h3>
        </CardTitle>
        <CardDescription>{t("since", { date: format.dateTime(d.createdAt, "date") })}</CardDescription>
        {canManage && (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("actions", { name: d.name })} />}>
                <EllipsisVerticalIcon aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onMembers}>
                    <UsersRoundIcon aria-hidden />
                    {t("manageAction")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onRename}>
                    <PencilIcon aria-hidden />
                    {t("renameAction")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" disabled={!deletable} onClick={onDelete}>
                    <Trash2Icon aria-hidden />
                    {t("deleteAction")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {!deletable && (
                  <p className="flex items-start gap-1.5 px-1.5 py-1 text-xs text-muted-foreground">
                    <ShieldOffIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {t("lastBlocked")}
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {count > 0 ? (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <UsersRoundIcon aria-hidden className="size-4 text-muted-foreground" />
            {t("memberCount", { count, n: format.number(count, "integer") })}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UsersRoundIcon aria-hidden className="size-4" />
            {t("noMembers")}
          </p>
        )}
        {count > 0 && (
          <div className="flex items-center gap-2">
            {/* Tailwind 4's space-x is logical (margin-inline-start): the overlap follows the page's direction. */}
            <ul className="flex -space-x-2">
              {d.members.slice(0, AVATARS).map((m) => (
                <li key={m.userId} title={m.name}>
                  <InitialsAvatar name={m.name} size="sm" className="ring-2 ring-card" />
                  <span className="sr-only">{m.name}</span>
                </li>
              ))}
            </ul>
            {extra > 0 && <span className="text-xs text-muted-foreground">{t("moreMembers", { n: format.number(extra, "integer") })}</span>}
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t bg-muted/30 py-3">
        <Button variant="outline" size="sm" className={TAP_SM} onClick={onMembers}>
          {canManage ? <UserPlusIcon aria-hidden /> : <UsersRoundIcon aria-hidden />}
          {canManage ? t("manageAction") : t("manageTitle", { name: d.name })}
        </Button>
      </CardFooter>
    </Card>
  );
}

function DepartmentFormDialog({
  open,
  department,
  organizationId,
  departments,
  onClose,
}: {
  open: boolean;
  /** null = create */
  department: OrgDepartmentRow | null;
  organizationId: string;
  departments: OrgDepartmentRow[];
  onClose: () => void;
}) {
  const t = useTranslations("org.departments");
  const actions = useTranslations("common.actions");
  const errorText = useOrgErrorText();
  const errorMap = useZodErrorMap();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema, { error: errorMap }),
    defaultValues: { name: department?.name ?? "" },
  });

  async function onSubmit(values: DepartmentValues) {
    setFormError(null);
    const name = normalizeDepartmentName(values.name);
    if (departments.some((d) => d.id !== department?.id && sameDepartmentName(d.name, name))) {
      form.setError("name", { message: t("duplicate") }, { shouldFocus: true });
      return;
    }
    const result = department
      ? await callAuth(() => authClient.organization.updateTeam({ teamId: department.id, data: { name, organizationId } }))
      : await callAuth(() => authClient.organization.createTeam({ name, organizationId }));
    if (!result.ok) {
      // The server's duplicate check (another manager created the same name meanwhile) belongs to the field.
      if (result.error?.code === "DEPARTMENT_NAME_TAKEN") form.setError("name", { message: t("duplicate") }, { shouldFocus: true });
      else setFormError(errorText(result.error));
      return;
    }
    toast.success(department ? t("renamed", { name }) : t("created", { name }));
    onClose();
    router.refresh();
  }

  const submitting = form.formState.isSubmitting;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className={DIALOG_CONTENT}>
        <DialogHeader>
          <DialogTitle>{department ? t("renameTitle") : t("createTitle")}</DialogTitle>
          {!department && <DialogDescription>{t("createDescription")}</DialogDescription>}
        </DialogHeader>
        <form id="department-form" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="department-name">{t("name")}</FieldLabel>
                <Input
                  id="department-name"
                  dir="auto"
                  {...nameTextProps(field.value)}
                  autoComplete="off"
                  maxLength={DEPARTMENT_NAME_MAX}
                  placeholder={t("namePlaceholder")}
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? "department-name-error" : undefined}
                  {...field}
                />
                {fieldState.invalid && <FieldError id="department-name-error" errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <FormError message={formError} />
        </form>
        <DialogFooter className={STICKY_FOOTER}>
          <DialogClose render={<Button variant="outline" disabled={submitting} />}>{actions("cancel")}</DialogClose>
          <Button type="submit" form="department-form" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? (department ? t("renaming") : t("creating")) : department ? actions("save") : actions("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDepartmentDialog({
  open,
  department,
  organizationId,
  onClose,
}: {
  open: boolean;
  department: OrgDepartmentRow | null;
  organizationId: string;
  onClose: () => void;
}) {
  const t = useTranslations("org.departments");
  const errorText = useOrgErrorText();
  const router = useRouter();
  const deleted = useRef(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("deleteTitle", { name: department?.name ?? "" })}
      description={t("deleteDescription")}
      confirmLabel={t("deleteConfirm")}
      pendingLabel={t("deleting")}
      // The card (and its menu button) goes away with the department: focus the list heading instead of <body>.
      finalFocus={() => {
        const target = deleted.current ? (document.getElementById(LIST_HEADING_ID) ?? true) : true;
        deleted.current = false;
        return target;
      }}
      onConfirm={async () => {
        if (!department) return null;
        const remove = () => callAuth(() => authClient.organization.removeTeam({ teamId: department.id, organizationId }));
        let result = await remove();
        // Better Auth refuses to delete the caller's ACTIVE team (session.activeTeamId, set when they accepted an
        // invitation to it). Nothing in Waqaya uses the active team: clear it and try once more.
        if (!result.ok && result.error?.code === "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM") {
          const cleared = await callAuth(() => authClient.organization.setActiveTeam({ teamId: null }));
          if (cleared.ok) result = await remove();
        }
        if (!result.ok) return errorText(result.error);
        deleted.current = true;
        toast.success(t("deleted", { name: department.name }));
        router.refresh();
        return null;
      }}
    />
  );
}

function DepartmentMembersDialog({
  open,
  department,
  organizationId,
  canManage,
  people,
  onClose,
}: {
  open: boolean;
  department: OrgDepartmentRow | null;
  organizationId: string;
  canManage: boolean;
  people: DepartmentPerson[];
  onClose: () => void;
}) {
  const t = useTranslations("org.departments");
  const actions = useTranslations("common.actions");
  const locale = useLocale();
  const errorText = useOrgErrorText();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const inDepartment = useMemo(() => new Set(department?.members.map((m) => m.userId) ?? []), [department]);
  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    return people
      .filter((p) => !inDepartment.has(p.userId))
      .filter((p) => !q || p.name.toLocaleLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [people, inDepartment, query, locale]);
  const everyoneIn = people.length > 0 && people.every((p) => inDepartment.has(p.userId));

  // After an add or a removal the clicked button goes away with its row (once the refreshed list arrives): focus
  // the search field (adding) or the "in the department" heading (removing), never <body> (WCAG 2.4.3).
  const [refocus, setRefocus] = useState<"search" | "heading" | null>(null);
  useEffect(() => {
    if (!refocus) return;
    const target = (refocus === "search" ? searchRef.current : null) ?? headingRef.current;
    target?.focus();
  }, [refocus, department]);

  async function change(kind: "add" | "remove", person: DepartmentPerson) {
    if (!department) return;
    setBusy(person.userId);
    setError(null);
    const body = { teamId: department.id, userId: person.userId, organizationId };
    const result =
      kind === "add"
        ? await callAuth(() => authClient.organization.addTeamMember(body))
        : await callAuth(() => authClient.organization.removeTeamMember(body));
    setBusy(null);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    toast.success(kind === "add" ? t("added", { name: person.name }) : t("removedMember", { name: person.name }));
    setRefocus(kind === "add" ? "search" : "heading");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setError(null);
          setRefocus(null);
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={DIALOG_CONTENT}
        // Never a "remove" button first (it acts at once): the search field for managers, the Close button otherwise.
        initialFocus={() => (canManage ? searchRef.current : null) ?? closeRef.current ?? true}
      >
        <DialogHeader>
          <DialogTitle dir="auto">{t("manageTitle", { name: department?.name ?? "" })}</DialogTitle>
          {canManage && <DialogDescription>{t("manageDescription")}</DialogDescription>}
        </DialogHeader>

        <section aria-labelledby="department-members-title" className="flex min-w-0 flex-col gap-2">
          <h3 id="department-members-title" ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
            {t("inDepartment")}
          </h3>
          {department && department.members.length > 0 ? (
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
              {department.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                  <InitialsAvatar name={m.name} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <NameText title={m.name} className="truncate text-sm font-medium">
                      {m.name}
                    </NameText>
                    <span dir="ltr" title={m.email} className={EMAIL_LINE}>
                      {m.email}
                    </span>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 max-sm:w-8 max-sm:px-0"
                      aria-label={t("removeMember", { name: m.name })}
                      disabled={busy !== null}
                      onClick={() => change("remove", m)}
                    >
                      {busy === m.userId ? <Spinner /> : <UserMinusIcon aria-hidden />}
                      {/* A visible label on wider screens; phones keep the icon (the accessible name says it all). */}
                      <span className="max-sm:sr-only">{t("removeShort")}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{t("noMembers")}</p>
          )}
        </section>

        {canManage && (
          <section aria-labelledby="department-add-title" className="flex min-w-0 flex-col gap-2">
            <h3 id="department-add-title" className="text-sm font-medium">
              {t("addMembers")}
            </h3>
            {everyoneIn ? (
              <p className="text-sm text-muted-foreground">{t("allIn")}</p>
            ) : (
              <>
                <Label htmlFor="department-add-search" className="sr-only">
                  {t("addSearch")}
                </Label>
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon aria-hidden />
                  </InputGroupAddon>
                  <InputGroupInput
                    ref={searchRef}
                    id="department-add-search"
                    type="search"
                    value={query}
                    placeholder={t("addSearch")}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </InputGroup>
                {candidates.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">{t("addEmpty")}</p>
                ) : (
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-lg ring-1 ring-foreground/10">
                    {candidates.map((p) => (
                      <li key={p.userId} className="flex items-center gap-3 px-3 py-2">
                        <InitialsAvatar name={p.name} size="sm" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <NameText title={p.name} className="truncate text-sm font-medium">
                            {p.name}
                          </NameText>
                          <span dir="ltr" title={p.email} className={EMAIL_LINE}>
                            {p.email}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className={TAP_SM}
                          aria-label={t("add", { name: p.name })}
                          disabled={busy !== null}
                          onClick={() => change("add", p)}
                        >
                          {busy === p.userId ? <Spinner /> : <UserPlusIcon aria-hidden />}
                          {actions("add")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}
        <div className="min-w-0">
          <FormError message={error} />
        </div>
        <DialogFooter className={STICKY_FOOTER}>
          <DialogClose ref={closeRef} render={<Button variant="outline" />}>
            {actions("close")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
