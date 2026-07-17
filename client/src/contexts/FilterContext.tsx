import React, { createContext, useContext, useState } from 'react';

export type PaymentFilter = 'All' | 'Debit' | 'Visa' | 'Mastercard' | 'Amex' | 'Cash' | 'Other';

interface FilterState {
  search: string;
  setSearch: (s: string) => void;
  categoryFilter: string | null;
  setCategoryFilter: (c: string | null) => void;
  paymentFilter: PaymentFilter;
  setPaymentFilter: (p: PaymentFilter) => void;
  clearAll: () => void;
}

const FilterContext = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [paymentFilter,  setPaymentFilter]  = useState<PaymentFilter>('All');

  function clearAll() {
    setSearch('');
    setCategoryFilter(null);
    setPaymentFilter('All');
  }

  return (
    <FilterContext.Provider value={{
      search, setSearch,
      categoryFilter, setCategoryFilter,
      paymentFilter, setPaymentFilter,
      clearAll,
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterState {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used inside FilterProvider');
  return ctx;
}
