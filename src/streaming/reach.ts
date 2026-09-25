export const streamReach = {
  metres: Infinity,
  at: -Infinity,
};

export function publishStreamReach(metres: number) {
  streamReach.metres = metres;
  streamReach.at = performance.now();
}

export function clearStreamReach() {
  streamReach.metres = Infinity;
  streamReach.at = -Infinity;
}
