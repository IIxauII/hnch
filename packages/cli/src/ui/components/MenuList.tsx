import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface MenuItem {
  label: string;
  value: string;
  detail?: string;
  disabled?: boolean;
}

interface MenuListProps {
  items: MenuItem[];
  onSelect: (value: string) => void;
  onClose?: () => void;
  title?: string;
}

export function MenuList({ items, onSelect, onClose, title }: MenuListProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        {title && <Text bold>{title}</Text>}
        <Text dimColor>(no items)</Text>
      </Box>
    );
  }

  const firstEnabled = items.findIndex((item) => !item.disabled);
  const [cursor, setCursor] = useState(Math.max(firstEnabled, 0));

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => {
        let next = (c - 1 + items.length) % items.length;
        let attempts = 0;
        while (items[next]?.disabled && attempts < items.length) {
          next = (next - 1 + items.length) % items.length;
          attempts++;
        }
        return next;
      });
    } else if (key.downArrow) {
      setCursor((c) => {
        let next = (c + 1) % items.length;
        let attempts = 0;
        while (items[next]?.disabled && attempts < items.length) {
          next = (next + 1) % items.length;
          attempts++;
        }
        return next;
      });
    } else if (key.return) {
      const item = items[cursor];
      if (item && !item.disabled) {
        onSelect(item.value);
      }
    } else if (key.escape) {
      onClose?.();
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      {title && <Text bold>{title}</Text>}
      <Box flexDirection="column">
        {items.map((item, i) => {
          const isCursor = i === cursor;
          const isDisabled = item.disabled ?? false;
          return (
            <Box key={item.value} gap={1}>
              <Text color={isCursor ? 'cyan' : undefined} dimColor={isDisabled}>
                {isCursor ? '>' : ' '}
              </Text>
              <Text bold={isCursor} dimColor={isDisabled}>
                {item.label}
              </Text>
              {item.detail && <Text dimColor>{item.detail}</Text>}
            </Box>
          );
        })}
      </Box>
      <Text dimColor>↑↓ select ⏎ confirm esc close</Text>
    </Box>
  );
}
