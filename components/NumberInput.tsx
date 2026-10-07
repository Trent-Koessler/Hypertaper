import React, { useEffect, useState } from 'react';

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  // undefined renders an empty box (e.g. to show a placeholder).
  value: number | undefined;
  onChange: (value: number) => void;
};

const parse = (text: string) => (text.trim() === '' ? 0 : Number(text));
const format = (value: number | undefined) => (value === undefined ? '' : String(value));

// A number box that keeps what the user typed as text. Binding a numeric value
// straight to <input type="number"> makes React write "0" back into a cleared
// box, and then typing "20" leaves "020" stuck on screen.
const NumberInput: React.FC<NumberInputProps> = ({ value, onChange, onBlur, ...rest }) => {
  const [text, setText] = useState(() => format(value));

  // Only take the outside value when it was changed by something else
  // (e.g. loading a preset), not when it came from this box's own typing.
  useEffect(() => {
    setText(t => (parse(t) === (value ?? 0) ? t : format(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={e => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={e => {
        // Tidy up on leaving the box: "020" becomes "20", an empty box shows its value.
        setText(format(value));
        onBlur?.(e);
      }}
    />
  );
};

export default NumberInput;
