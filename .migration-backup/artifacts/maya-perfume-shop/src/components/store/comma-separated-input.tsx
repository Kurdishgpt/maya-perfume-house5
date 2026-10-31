import { useEffect, useRef, useState, type ChangeEvent } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className: string;
  testId: string;
  placeholder?: string;
  multiline?: boolean;
};

const canonical = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean).join(", ");

/** Keep separators while typing, but still accept new values from an AI draft. */
export function CommaSeparatedInput({ value, onChange, className, testId, placeholder, multiline }: Props) {
  const [text, setText] = useState(value);
  const published = useRef(value);
  useEffect(() => {
    if (value !== published.current) {
      published.current = value;
      setText(value);
    }
  }, [value]);
  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const raw = event.target.value;
    published.current = canonical(raw);
    setText(raw);
    onChange(raw);
  };
  const props = {
    value: text,
    onChange: change,
    onBlur: () => setText(canonical(text)),
    className,
    placeholder,
    "data-testid": testId,
  };
  return multiline ? <textarea {...props} rows={2}/> : <input {...props}/>;
}
