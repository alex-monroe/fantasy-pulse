'use client';

import { Team } from '@/lib/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';

function SortableItem({ team }: { team: Team }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: team.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="p-2 my-2 flex items-center">
        <GripVertical className="h-5 w-5 mr-2 text-muted-foreground" />
        <span>{team.name}</span>
      </Card>
    </div>
  );
}

export function MatchupSelector({
  teams,
  onOrderChange,
}: {
  teams: Team[];
  onOrderChange: (teams: Team[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = teams.findIndex((team) => team.id === active.id);
      const newIndex = teams.findIndex((team) => team.id === over.id);
      onOrderChange(arrayMove(teams, oldIndex, newIndex));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={teams} strategy={verticalListSortingStrategy}>
        {teams.map((team) => (
          <SortableItem key={team.id} team={team} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
