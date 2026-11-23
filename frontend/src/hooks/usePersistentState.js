import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../utils/storage';

export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => readStored(key, initial));
  useEffect(() => { writeStored(key, value); }, [key, value]);
  return [value, setValue];
}
