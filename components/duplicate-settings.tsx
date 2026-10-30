"use client";
import { Checkbox } from "@heroui/react";
import { Field, SelectField } from "./ui";
import type { DuplicateRule } from "@/lib/duplicates";
export function DuplicateSettings({ rule, options, onChange }: { rule: DuplicateRule; options: { key: string; label: string }[]; onChange: (value: DuplicateRule) => void }) {
  return <div className="card field-editor">
    <h3>Reject duplicate data</h3>
    <p className="muted">Check previous successful submissions to this calendar or form. Empty values are ignored.</p>
    <Checkbox isSelected={rule.enabled} onValueChange={enabled => onChange({ ...rule, enabled })}>Reject duplicate submissions</Checkbox>
    {rule.enabled && <>
      <p className="muted">Reject data by</p>
      {!options.length && <p>Add a contact, date, or text question to choose a field.</p>}
      {options.map(option => <div key={option.key}><Checkbox isSelected={rule.fields.includes(option.key)} onValueChange={selected => onChange({ ...rule, fields: selected ? [...rule.fields, option.key] : rule.fields.filter(key => key !== option.key) })}>{option.label}</Checkbox></div>)}
      {!!rule.fields.filter(key => !options.some(option => option.key === key)).length && <p role="alert">A selected field is no longer available. Clear it before saving. <button type="button" onClick={() => onChange({ ...rule, fields: rule.fields.filter(key => options.some(option => option.key === key)) })}>Clear unavailable fields</button></p>}
      <SelectField label="Reject when" value={rule.match} onChange={(match: "any" | "all") => onChange({ ...rule, match })} options={[{ value: "any", label: "Any selected field matches (OR)" }, { value: "all", label: "All selected fields match together (AND)" }]} />
      <Field label="Duplicate error message" type="textarea" required maxLength={1000} value={rule.message} onChange={(message: string) => onChange({ ...rule, message })} description="Customers see this message when their submission is rejected." />
      <p className="muted">Calendar checks exclude cancelled bookings. Forms check completed responses only. Retrying the same submission does not count as a duplicate.</p>
    </>}
  </div>;
}
