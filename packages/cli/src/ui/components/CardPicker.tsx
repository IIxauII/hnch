import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Scale } from '@hnch/shared';

interface Props {
  scale: Scale;
  selected?: string | undefined;
  onToggleCurrentVote: (card: string) => void;
  onClearCurrentVote: () => void;
  disabled?: boolean | undefined;
}

export function CardPicker({
  scale,
  selected,
  onToggleCurrentVote,
  onClearCurrentVote,
  disabled,
}: Props): React.ReactElement {
  const [cursor, setCursor] = useState(0);

  useInput((_input, key) => {
    if (disabled) return;

    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.rightArrow) {
      setCursor((c) => Math.min(scale.cards.length - 1, c + 1));
    } else if (key.return) {
      onToggleCurrentVote(scale.cards[cursor]!);
    } else if (key.backspace || key.delete) {
      onClearCurrentVote();
    }
  });

  return (
    <Box flexDirection="column" gap={0}>
      <Box gap={1}>
        {scale.cards.map((card, i) => {
          const isCursor = i === cursor;
          const isSelected = card === selected;
          return (
            <Text
              key={card}
              inverse={isCursor}
              bold={isSelected}
              {...(isSelected && { color: 'cyan' as const })}
            >
              {isSelected ? `[${card}]` : ` ${card} `}
            </Text>
          );
        })}
      </Box>
      <Text dimColor> ←→ navigate ⏎ select ⌫ clear</Text>
    </Box>
  );
}
