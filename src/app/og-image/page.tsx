export const dynamic = "force-static";

export default function OGImagePage() {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: `
          radial-gradient(ellipse 80% 60% at 50% 40%, #7c3aed33 0%, transparent 70%),
          radial-gradient(ellipse 40% 50% at 80% 20%, #7c3aed22 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 20% 80%, #7c3aed18 0%, transparent 50%),
          linear-gradient(180deg, #0a0a0a 0%, #111111 50%, #0a0a0a 100%)
        `,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#ffffff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid pattern overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(#7c3aed08 1px, transparent 1px),
            linear-gradient(90deg, #7c3aed08 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        {/* Logo emoji */}
        <div style={{ fontSize: 72, lineHeight: 1 }}>🎬</div>

        {/* Project name */}
        <h1
          style={{
            fontSize: 72,
            fontWeight: 800,
            margin: 0,
            background: `linear-gradient(135deg, #ffffff 0%, #7c3aed 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          Seedance2
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: 28,
            fontWeight: 400,
            margin: 0,
            color: "rgba(255, 255, 255, 0.7)",
            maxWidth: 800,
            lineHeight: 1.4,
          }}
        >
          AI-powered short video creation platform - Sora 2, Veo 3.1, and more
        </p>

        {/* Domain */}
        <p
          style={{
            fontSize: 20,
            fontWeight: 500,
            margin: 0,
            color: "#7c3aed",
            letterSpacing: "0.05em",
          }}
        >
          seedance2.in
        </p>
      </div>
    </div>
  );
}