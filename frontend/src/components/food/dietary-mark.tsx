export function DietaryMark({ veg }: { veg: boolean }) {
  return (
    <span
      role="img"
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
      className={veg ? "food-mark veg" : "food-mark nonveg"}
    >
      {veg ? "\u25CF" : "\u25B2"}
    </span>
  );
}
