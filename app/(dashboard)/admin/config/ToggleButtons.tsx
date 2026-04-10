import {
  getIn,
  toggleIn,
} from '@/src/modules/admin-config/presentation/config-editor'

import { Button } from '@/components/ui/button'

export type ToggleField = [label: string, path: (string | number)[]]

type ToggleButtonsProps = {
  fields: ToggleField[]
  obj: any
  onChange: (next: any) => void
}

export default function ToggleButtons({
  fields,
  obj,
  onChange,
}: ToggleButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.map(([label, path]) => (
        <Button
          key={label}
          type="button"
          size="sm"
          variant={getIn(obj, path, false) ? 'secondary' : 'primary'}
          aria-pressed={!!getIn(obj, path, false)}
          onClick={() => onChange(toggleIn(obj, path))}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
