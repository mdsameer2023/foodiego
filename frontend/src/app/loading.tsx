export default function Loading() {
  return (
    <div className="container page-space page-loading" aria-label="Loading page">
      <div className="skeleton h-14 w-2/3 mb-8 rounded-xl" />
      <div className="restaurant-grid">
        {[1, 2, 3].map((i) => (
          <div className="skeleton h-80 rounded-2xl" key={i} />
        ))}
      </div>
    </div>
  );
}
