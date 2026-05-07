import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from './TextInput.js';

interface CustomScaleEditorProps {
  initialName?: string;
  initialCards?: string[];
  onSave: (name: string, cards: string[]) => void;
  onCancel: () => void;
}

type EditMode = 'editing-name' | 'editing-cards';

export function CustomScaleEditor({
  initialName = '',
  initialCards = [],
  onSave,
  onCancel,
}: CustomScaleEditorProps): React.ReactElement {
  const isEditMode = initialName.length > 0;
  const [name, setName] = useState(initialName);
  const [cards, setCards] = useState(initialCards.length > 0 ? initialCards : ['']);
  const [cardCursor, setCardCursor] = useState(0);
  const [mode, setMode] = useState<EditMode>('editing-name');
  const [validationError, setValidationError] = useState('');

  const handleNameSubmit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setValidationError('Name must be 1-40 characters');
      return;
    }
    setName(trimmed);
    setValidationError('');
    setMode('editing-cards');
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      setValidationError('Name must be 1-40 characters');
      return;
    }
    const trimmedCards = cards.map((c) => c.trim()).filter((c) => c.length > 0);
    const uniqueCards = Array.from(new Set(trimmedCards));
    if (uniqueCards.length < 2) {
      setValidationError('Need at least 2 unique non-empty cards');
      return;
    }
    setValidationError('');
    onSave(trimmed, uniqueCards);
  };

  useInput(
    (input, key) => {
      if (mode === 'editing-cards') {
        if (key.leftArrow) {
          setCardCursor((c) => Math.max(0, c - 1));
        } else if (key.rightArrow) {
          setCardCursor((c) => {
            const nextCursor = c + 1;
            if (nextCursor >= cards.length && cards.length < 25) {
              setCards((prev) => [...prev, '']);
              return nextCursor;
            }
            return Math.min(nextCursor, cards.length - 1);
          });
        } else if (key.return) {
          handleSave();
        } else if (key.escape) {
          onCancel();
        } else if (key.tab) {
          setMode('editing-name');
        } else if (key.backspace) {
          const card = cards[cardCursor] || '';
          if (card.length === 0) {
            if (cards.length > 2) {
              const newCards = cards.filter((_, i) => i !== cardCursor);
              setCards(newCards);
              setCardCursor(Math.max(0, cardCursor - 1));
            }
          } else {
            const newCards = [...cards];
            newCards[cardCursor] = card.slice(0, -1);
            setCards(newCards);
          }
        } else if (input && !key.ctrl && !key.meta) {
          const currentCardText = cards[cardCursor] || '';
          if (currentCardText.length < 10) {
            const newCards = [...cards];
            newCards[cardCursor] = currentCardText + input;
            setCards(newCards);
          }
        }
      }
    },
    { isActive: mode === 'editing-cards' },
  );

  const title = isEditMode ? '── Edit Custom Scale ──' : '── Create Custom Scale ──';

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>

      <Box flexDirection="column" gap={0}>
        <Text>Name:</Text>
        <TextInput
          value={name}
          onChange={setName}
          onSubmit={handleNameSubmit}
          onCancel={onCancel}
          placeholder="Scale name"
          isActive={mode === 'editing-name'}
        />
      </Box>

      {mode === 'editing-cards' && (
        <Box flexDirection="column" gap={0}>
          <Text>Cards:</Text>
          <Box gap={1} flexWrap="wrap">
            {cards.map((card, i) => {
              const isCursor = i === cardCursor;
              return (
                <Text key={i} inverse={isCursor} color={isCursor ? undefined : 'cyan'}>
                  {card.length > 0 ? card : '·'}
                </Text>
              );
            })}
          </Box>
        </Box>
      )}

      {validationError && <Text color="red">{validationError}</Text>}

      <Text dimColor>
        {mode === 'editing-name'
          ? '⏎ next  esc cancel'
          : '←→ navigate  typing adds card  bsp delete  ⏎ save  tab name  esc cancel'}
      </Text>
    </Box>
  );
}
