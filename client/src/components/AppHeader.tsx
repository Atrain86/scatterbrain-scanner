// Shared header for all authenticated pages — logo + "Scatterbrain" wordmark
export default function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center pt-3 pb-2">
      <img
        src="/logo.png"
        alt="Scatterbrain"
        className="h-16 w-auto"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <p className="text-white font-bold text-xl tracking-wide leading-tight mt-1"
         style={{ fontFamily: "'Poppins', sans-serif" }}>
        Scatterbrain
      </p>
      {subtitle && (
        <p className="text-sb-muted text-xs mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
