import { fiscalizedFuelOptions } from '@/components/transactions/fiscalized/constants'
import { Button } from '@/components/ui/button'
import { FiltersRow } from '@/components/ui/filters-row'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

type FiscalizedFiltersRowProps = {
  search: string
  customer: string
  fuelType: string
  startDate: string
  endDate: string
  onSearchChange: (value: string) => void
  onCustomerChange: (value: string) => void
  onFuelTypeChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onToday: () => void
  onAllDates: () => void
  todayDisabled?: boolean
  onRefresh: () => void
  loading: boolean
}

const FiscalizedFiltersRow = ({
  search,
  customer,
  fuelType,
  startDate,
  endDate,
  onSearchChange,
  onCustomerChange,
  onFuelTypeChange,
  onStartDateChange,
  onEndDateChange,
  onToday,
  onAllDates,
  todayDisabled,
  onRefresh,
  loading,
}: FiscalizedFiltersRowProps) => (
  <FiltersRow>
    <FiltersRow.Search
      value={search}
      onChange={onSearchChange}
      placeholder="Search POS reference, cloud ID, fiscal ref, or pump"
    />
    <FiltersRow.Slot width="min-w-[200px] flex-1">
      <Input
        value={customer}
        onChange={(event) => onCustomerChange(event.target.value)}
        placeholder="Buyer name or TIN"
      />
    </FiltersRow.Slot>
    <FiltersRow.Slot>
      <Select
        value={fuelType}
        onChange={(event) => onFuelTypeChange(event.target.value)}
      >
        {fiscalizedFuelOptions.map((option) => (
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
    <FiltersRow.Action onClick={onRefresh} loading={loading} />
  </FiltersRow>
)

export default FiscalizedFiltersRow
