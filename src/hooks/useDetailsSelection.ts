import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useDetailsSelection(paramName = 'selected') {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get(paramName)
  );

  useEffect(() => {
    const paramValue = searchParams.get(paramName);
    if (paramValue && !selectedId) {
      setSelectedId(paramValue);
    }
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(paramName, id);
      return next;
    }, { replace: true });
  }, [paramName, setSearchParams]);

  const deselect = useCallback(() => {
    setSelectedId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(paramName);
      return next;
    }, { replace: true });
  }, [paramName, setSearchParams]);

  const toggle = useCallback((id: string) => {
    if (selectedId === id) {
      deselect();
    } else {
      select(id);
    }
  }, [selectedId, select, deselect]);

  return {
    selectedId,
    isOpen: selectedId !== null,
    select,
    deselect,
    toggle,
  };
}
