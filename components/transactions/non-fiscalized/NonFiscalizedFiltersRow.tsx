import { nonFiscalizedStatusOptions } from '@/components/transactions/non-fiscalized/constants'
import { Button } from '@/components/ui/button'
import { FiltersRow } from '@/components/ui/filters-row'
import { Select } from '@/components/ui/select'

type NonFiscalizedFiltersRowProps = {
  search: string
  status: string
  startDate: string
  endDate: string
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onToday: () => void
  onAllDates: () => void
  todayDisabled?: boolean
  onRefresh: () => void
}

const NonFiscalizedFiltersRow = ({
  search,
  status,
  startDate,
  endDate,
  onSearchChange,
  onStatusChange,
  onStartDateChange,
  onEndDateChange,
  onToday,
  onAllDates,
  todayDisabled,
  onRefresh,
}: NonFiscalizedFiltersRowProps) => (
  <FiltersRow>
    <FiltersRow.Search
      value={search}
      onChange={onSearchChange}
      placeholder="Search by POS reference or ID"
    />
    <FiltersRow.Slot>
      <Select
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
      >
        {nonFiscalizedStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </FiltersRow.Slot>
    <FiltersRow.DateRange
      from={startDate}
      to={endDate}
      onFromChange={onStartDateChange}
      onToChange={onEndDateChange}
    />
    <Button
      type="button"
      variant="secondary"
      onClick={onToday}
      disabled={todayDisabled}
    >
      Today
    </Button>
    <Button type="button" variant="secondary" onClick={onAllDates}>
      All dates
    </Button>
    <FiltersRow.Action onClick={onRefresh} />
  </FiltersRow>
)

export default NonFiscalizedFiltersRow
