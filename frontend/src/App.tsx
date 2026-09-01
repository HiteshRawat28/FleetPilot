import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  BusFront,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  ExternalLink,
  FileText,
  Fuel,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Navigation,
  Phone,
  Plus,
  Radio,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  UserRound,
  UsersRound,
  WalletCards,
  WifiOff,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  api,
  ApiError,
  API_URL,
  clearClientSession,
  roleLabel,
  type Role,
  type User,
} from "./api";
import type {
  AnalyticsData,
  AppNotification,
  AssignmentFailureReason,
  Driver,
  Finance,
  GlobalSearchResponse,
  GlobalSearchResult,
  LicenseCategory,
  Maintenance,
  NotificationResponse,
  Place,
  RouteEstimateResponse,
  RouteOption,
  Trip,
  TripDetails,
  TripExpense,
  TripLocationPoint,
  TripProfitabilityEstimate,
  TripTracking,
  Vehicle,
  VehicleDetails,
} from "./types";
import { ChatDrawer } from "./chat/ChatDrawer";
import { PasswordResetPage } from "./auth/PasswordResetPages";
import {
  applyTrackingEvent,
  trackingPath,
  trackingStreamUrl,
  type LocationUpdateEvent,
  type TrackingSnapshotEvent,
} from "./tracking";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const pretty = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const date = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(s));
const dateTime = (s: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
const roles: Role[] = [
  "OWNER",
  "ADMIN",
  "FLEET_MANAGER",
  "DISPATCHER",
  "SAFETY_OFFICER",
  "FINANCIAL_ANALYST",
  "DRIVER",
];
const assignableRoles: Role[] = [
  "ADMIN",
  "FLEET_MANAGER",
  "DISPATCHER",
  "SAFETY_OFFICER",
  "FINANCIAL_ANALYST",
  "DRIVER",
];

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div
      className={`logo transitops-logo ${light ? "light" : ""}`}
      role="img"
      aria-label="TransitOps — Fleet and Transport Operations"
    >
      <span className="transitops-mark" aria-hidden="true">
        <svg viewBox="0 0 42 42">
          <path
            className="logo-route"
            d="M8.5 28h8c4.5 0 6.5-2 6.5-5s-2-5-6.5-5H13"
          />
          <circle className="logo-start" cx="8.5" cy="28" r="3" />
          <circle className="logo-stop" cx="13" cy="18" r="2.5" />
          <path
            className="logo-pin"
            d="M32 6.5a6 6 0 0 0-6 6c0 4.6 6 10.6 6 10.6s6-6 6-10.6a6 6 0 0 0-6-6Z"
          />
          <circle className="logo-pin-core" cx="32" cy="12.5" r="2.1" />
        </svg>
      </span>
      <div className="transitops-wordmark">
        <strong>
          Transit<span>Ops</span>
        </strong>
        <small>Fleet &amp; transport operations</small>
      </div>
    </div>
  );
}
function GoogleLogo() {
  return (
    <svg className="google-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.37l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.92A6.02 6.02 0 0 1 6.09 12c0-.67.12-1.32.31-1.92V7.46H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.54l3.34-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.46l3.34 2.62c.79-2.37 3-4.13 5.6-4.13Z"
      />
    </svg>
  );
}
function Button({
  children,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
  [key: string]: any;
}) {
  return (
    <button className={`button ${variant}`} {...props}>
      {children}
    </button>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status s-${value.toLowerCase()}`}>
      <i />
      {pretty(value)}
    </span>
  );
}
function Empty({ text = "No records found" }: { text?: string }) {
  return (
    <div className="empty">
      <Search size={28} />
      <p>{text}</p>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`modal ${wide ? "modal-wide" : ""}`}>
        <div className="modal-head">
          <div>
            <small>FleetPilot</small>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
  error = false,
}: {
  label: string;
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <label className={`field ${error ? "field-error" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function UserAvatar({
  user,
  size = "normal",
}: {
  user: User;
  size?: "normal" | "large";
}) {
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`avatar user-avatar ${size === "large" ? "large" : ""}`}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={`${user.name} profile`} />
      ) : (
        initials || <UserRound />
      )}
    </span>
  );
}
function AssignmentFailurePanel({
  reasons,
  title = "Assignment cannot be created",
}: {
  reasons: AssignmentFailureReason[];
  title?: string;
}) {
  if (!reasons.length) return null;
  return (
    <div className="assignment-failures">
      <AlertTriangle />
      <div>
        <b>{title}</b>
        <ul>
          {reasons.map((reason, index) => (
            <li key={`${reason.code}-${index}`}>{reason.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
function ProfitabilityPanel({
  estimate,
}: {
  estimate: TripProfitabilityEstimate;
}) {
  const complete = estimate.estimatedProfitInr !== null,
    loss = complete && estimate.estimatedProfitInr! < 0;
  const historicalFuel =
    estimate.fuelRateSource === "RECENT_FUEL_AND_TRIP_HISTORY" &&
    estimate.fuelPricePerLitreInr !== null &&
    estimate.fuelEfficiencyKmPerLitre !== null;
  const fuelBasis = historicalFuel
    ? `Fuel: ${money(estimate.fuelRatePerKmInr)}/km from ${estimate.fuelEfficiencyKmPerLitre!.toLocaleString("en-IN", { maximumFractionDigits: 2 })} km/L vehicle history and ${money(estimate.fuelPricePerLitreInr!)}/L recorded price${estimate.fuelPriceAsOf ? ` as of ${date(estimate.fuelPriceAsOf)}` : ""}.`
    : `Fuel: ${money(estimate.fuelRatePerKmInr)}/km (${pretty(estimate.fuelRateSource)} fallback; insufficient recent price or vehicle efficiency history).`;
  return (
    <section
      className={`profitability-panel ${loss ? "loss" : ""}`}
      aria-label="Estimated trip profitability"
    >
      <div className="profitability-head">
        <div>
          <span>
            {complete ? "Planning estimate" : "Partial planning estimate"}
          </span>
          <h3>Estimated trip profitability</h3>
          <p>
            Based on stored trip, vehicle, route and maintenance data. This is
            not live telemetry or a guaranteed result.
          </p>
        </div>
        <CircleDollarSign />
      </div>
      <div className="profitability-grid">
        <div>
          <span>Expected revenue</span>
          <b>{money(estimate.expectedRevenueInr)}</b>
        </div>
        <div>
          <span>Estimated fuel</span>
          <b>-{money(estimate.estimatedFuelCostInr)}</b>
        </div>
        <div>
          <span>Maintenance allocation</span>
          <b>-{money(estimate.estimatedMaintenanceCostInr)}</b>
        </div>
        <div>
          <span>Estimated tolls</span>
          <b>
            {estimate.estimatedTollsInr === null
              ? "Unavailable"
              : `-${money(estimate.estimatedTollsInr)}`}
          </b>
        </div>
        <div>
          <span>Estimated total cost</span>
          <b>
            {estimate.estimatedTotalCostInr === null
              ? "Pending toll data"
              : `-${money(estimate.estimatedTotalCostInr)}`}
          </b>
        </div>
        <div className="profit-result">
          <span>
            {complete
              ? loss
                ? "Estimated loss"
                : "Estimated profit"
              : "Profit pending"}
          </span>
          <strong>
            {estimate.estimatedProfitInr === null
              ? "—"
              : money(estimate.estimatedProfitInr)}
          </strong>
          <small>
            {estimate.estimateStatus === "PARTIAL_TOLLS_UNAVAILABLE"
              ? "Toll price unavailable; no zero-value assumption used"
              : estimate.profitMarginPercent == null
                ? "Margin unavailable at zero revenue"
                : `${estimate.profitMarginPercent.toLocaleString("en-IN", { maximumFractionDigits: 2 })}% margin`}
          </small>
        </div>
      </div>
      <p className="profitability-basis">
        {fuelBasis} Maintenance: {money(estimate.maintenanceRatePerKmInr)}/km
        using{" "}
        {estimate.maintenanceRateSource === "HISTORICAL_MAINTENANCE"
          ? "recorded closed maintenance and completed-trip distance"
          : "the vehicle acquisition-cost/useful-life heuristic"}
        .
      </p>
    </section>
  );
}
function LocationAutocomplete({
  label,
  text,
  selected,
  onText,
  onSelect,
}: {
  label: string;
  text: string;
  selected: Place | null;
  onText: (value: string) => void;
  onSelect: (place: Place) => void;
}) {
  const [options, setOptions] = useState<Place[]>([]),
    [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
      "idle",
    ),
    [open, setOpen] = useState(false),
    inputId = `trip-${label.toLowerCase()}`;
  useEffect(() => {
    if (selected?.label === text || text.trim().length < 2) {
      setOptions([]);
      setState("idle");
      return;
    }
    let active = true;
    setState("loading");
    const timer = window.setTimeout(
      () =>
        api<Place[]>(`/places/search?q=${encodeURIComponent(text.trim())}`)
          .then((rows) => {
            if (active) {
              setOptions(rows);
              setState("ready");
              setOpen(true);
            }
          })
          .catch(() => {
            if (active) {
              setOptions([]);
              setState("error");
              setOpen(true);
            }
          }),
      300,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selected?.label, text]);
  return (
    <div className="field location-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="location-input">
        <Search />
        <input
          id={inputId}
          value={text}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${inputId}-suggestions`}
          placeholder={`Type ${label.toLowerCase()}`}
          onFocus={() => options.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            onText(e.target.value);
            setOpen(true);
          }}
          required
        />
        {selected && <Check aria-label="Location selected" />}
      </div>
      {open && text.trim().length >= 2 && (
        <div
          className="location-suggestions"
          id={`${inputId}-suggestions`}
          role="listbox"
        >
          {state === "loading" && <span>Finding locations…</span>}
          {state === "error" && (
            <span>Location suggestions are temporarily unavailable.</span>
          )}
          {state === "ready" && !options.length && (
            <span>No matching locations found.</span>
          )}
          {options.map((place) => (
            <button
              type="button"
              role="option"
              aria-selected={selected?.id === place.id}
              key={place.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(place);
                setOpen(false);
              }}
            >
              <Navigation />
              <span>
                <b>{place.name}</b>
                <small>{place.label}</small>
              </span>
              <em>
                {place.provider === "BUILT_IN"
                  ? "City"
                  : pretty(place.provider)}
              </em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const routeDuration = (minutes: number) =>
  `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} hr ` : ""}${minutes % 60} min`;
function RouteOptions({
  options,
  selected,
  onSelect,
}: {
  options: RouteOption[];
  selected: RouteOption | null;
  onSelect: (route: RouteOption) => void;
}) {
  return (
    <section
      className="route-estimate-options"
      aria-label="Suggested route options"
    >
      <div className="route-options-head">
        <div>
          <span>Suggested routes</span>
          <h3>Choose a planning route</h3>
        </div>
        <small>
          Provider tolls are preferred; free estimates use recorded FleetPilot
          history and are not live telemetry.
        </small>
      </div>
      <div className="route-option-grid">
        {options.map((route) => {
          const tollText =
            route.estimatedToll === null
              ? "Toll price unavailable"
              : route.tollEstimateStatus === "NO_TOLLS_EXPECTED"
                ? "No toll expected"
                : route.tollEstimateStatus === "HISTORICAL_ESTIMATE"
                  ? `Historical toll ${money(route.estimatedToll)} · ${route.tollConfidence?.toLowerCase()} confidence · ${route.tollSampleSize} trip${route.tollSampleSize === 1 ? "" : "s"}`
                  : `Provider toll ${money(route.estimatedToll)}`;
          return (
            <button
              type="button"
              aria-pressed={selected?.id === route.id}
              className={selected?.id === route.id ? "selected" : ""}
              key={route.id}
              onClick={() => onSelect(route)}
            >
              <header>
                <span>{route.label}</span>
                {route.recommended && <em>Recommended</em>}
              </header>
              <strong>{route.distanceKm.toLocaleString("en-IN")} km</strong>
              <p>
                {routeDuration(route.durationMinutes)} · {route.via}
              </p>
              <footer>
                <span>{tollText}</span>
                <small>
                  {route.tollEstimateStatus === "HISTORICAL_ESTIMATE"
                    ? "Fleet history"
                    : pretty(route.provider)}
                </small>
              </footer>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const root = useRef<HTMLElement>(null);
  void onLogin;
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (!root.current) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ delay: 0.2, defaults: { ease: "power3.out" } })
        .from(".landing-nav", { y: -30, opacity: 0, duration: 0.8 })
        .from(".hero-kicker", { y: 24, opacity: 0, duration: 0.65 }, "-=.35")
        .from(
          ".hero-line span",
          { yPercent: 130, stagger: 0.08, duration: 1 },
          "-=.35",
        )
        .from(
          ".hero-accent",
          { clipPath: "polygon(50% 0,50% 0,50% 100%,50% 100%)", duration: 1 },
          "-=.75",
        )
        .from(
          ".hero-truck-cutout",
          { y: 180, scale: 0.72, rotate: 8, opacity: 0, duration: 1.35 },
          "-=.9",
        )
        .from(
          ".fleet-orbit-card",
          { scale: 0, opacity: 0, stagger: 0.1, duration: 0.55 },
          "-=.65",
        )
        .from(".hero-actions", { y: 20, opacity: 0, duration: 0.6 }, "-=.4");
      gsap
        .timeline({
          scrollTrigger: {
            trigger: ".landing-hero",
            start: "1% top",
            end: "bottom top",
            scrub: 1,
          },
        })
        .to(".landing-hero", {
          rotate: 5,
          scale: 0.91,
          yPercent: 24,
          borderRadius: "36px",
          ease: "none",
        })
        .to(
          ".hero-truck-cutout",
          { yPercent: 18, rotate: -3, scale: 1.08, ease: "none" },
          "<",
        )
        .to(
          ".fleet-orbit-card",
          { yPercent: -35, stagger: 0.08, ease: "none" },
          "<",
        );
      gsap.to(".statement-word", {
        color: "#f1eade",
        stagger: 1,
        ease: "none",
        scrollTrigger: {
          trigger: ".landing-statement",
          start: "top 68%",
          end: "70% 55%",
          scrub: true,
        },
      });
      gsap.to(".statement-clip", {
        clipPath: "polygon(0 0,100% 0,100% 100%,0 100%)",
        scrollTrigger: {
          trigger: ".landing-statement",
          start: "35% 70%",
          end: "60% 55%",
          scrub: true,
        },
      });
      gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) =>
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: "top 82%" },
          y: 70,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
        }),
      );
      const desktop = gsap.matchMedia();
      desktop.add("(min-width: 1001px)", () => {
        const track = document.querySelector<HTMLElement>(".modules-track");
        if (track) {
          const distance = () =>
            Math.max(
              0,
              track.scrollWidth - window.innerWidth + window.innerWidth * 0.12,
            );
          gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: ".modules-section",
              start: "top top",
              end: () => `+=${distance() + 240}`,
              scrub: 1,
              pin: true,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });
        }
        gsap
          .timeline({
            scrollTrigger: {
              trigger: ".control-section",
              start: "top 78%",
              end: "bottom 22%",
              scrub: 1,
            },
          })
          .fromTo(
            ".dashboard-showcase",
            { clipPath: "circle(18% at 63% 50%)", scale: 0.82 },
            { clipPath: "circle(100% at 50% 50%)", scale: 1, ease: "none" },
          )
          .fromTo(
            ".control-copy",
            { xPercent: 0, opacity: 1 },
            { xPercent: -7, opacity: 0.72, ease: "none" },
            "<",
          );
      });
      return () => desktop.revert();
    }, root);
    return () => ctx.revert();
  }, []);
  const openLogin = () => location.assign("/login");
  return (
    <main className="landing" ref={root}>
      <nav className="landing-nav">
        <Logo />
        <div className="landing-links">
          <a href="#platform">Platform</a>
          <a href="#control">Control room</a>
          <a href="#results">Capabilities</a>
        </div>
        <div className="landing-auth">
          <a href="/login">Sign in</a>
          <a className="nav-login" href="/signup">
            Start free <ArrowUpRight size={16} />
          </a>
        </div>
      </nav>
      <section className="landing-hero">
        <div className="hero-noise" />
        <div className="hero-kicker">
          <span>
            <Zap size={14} /> Live intelligence
          </span>
          Built for fleets that never stand still
        </div>
        <div className="hero-title">
          <div className="hero-line">
            <span>Move smarter.</span>
          </div>
          <div className="hero-line hero-accent">
            <span>Stay ahead.</span>
          </div>
        </div>
        <p className="hero-description">
          One calm command center for every vehicle, driver and delivery—built
          to keep your operation moving.
        </p>
        <div className="hero-actions">
          <a className="hero-primary" href="/signup">
            Start your workspace <ArrowUpRight />
          </a>
          <a href="#platform">
            See how it works <ArrowDown />
          </a>
        </div>
        <div className="hero-stage hero-world">
          <div className="world-grid" />
          <div className="route-loop route-loop-one" />
          <img
            className="hero-truck-cutout"
            src="/fleetpilot-truck-cutout.png"
            alt="FleetPilot electric delivery truck"
          />
          <div className="float-card fleet-orbit-card card-route">
            <small>LIVE TRIP</small>
            <b>DEL → JAI</b>
            <span>
              <i /> On schedule
            </span>
          </div>
        </div>
        <div className="hero-ticker">
          <div>
            DISPATCH / TELEMATICS / SAFETY / MAINTENANCE / FINANCE / ANALYTICS
            /&nbsp;
          </div>
          <div>
            DISPATCH / TELEMATICS / SAFETY / MAINTENANCE / FINANCE / ANALYTICS
            /&nbsp;
          </div>
        </div>
      </section>
      <section className="landing-statement" id="platform">
        <span className="section-index">01 / PLATFORM</span>
        <p>
          {[
            "FROM",
            "THE",
            "FIRST",
            "IGNITION",
            "TO",
            "THE",
            "FINAL",
            "DELIVERY,",
            "EVERY",
            "SIGNAL",
            "BECOMES",
            "A",
            "DECISION.",
          ].map((word, i) => (
            <span className="statement-word" key={`${word}-${i}`}>
              {word}{" "}
            </span>
          ))}
        </p>
        <div className="statement-clip">
          <span>INTELLIGENCE IN MOTION</span>
        </div>
        <div className="statement-pill">
          <Sparkles /> One intelligent operating layer
        </div>
      </section>
      <section className="control-section" id="control">
        <div className="control-copy reveal">
          <span className="section-index">02 / CONTROL ROOM</span>
          <h2>
            See the whole fleet.
            <br />
            <i>Act in the moment.</i>
          </h2>
          <p>
            A live command center that turns complex movement into clear action.
            Capacity, compliance, cost and delivery—always in frame.
          </p>
          <button onClick={openLogin}>
            Open the dashboard <ArrowUpRight />
          </button>
        </div>
        <div className="dashboard-showcase reveal">
          <div className="dash-top">
            <Logo light />
            <span>
              OPERATIONS LIVE <i />
            </span>
          </div>
          <div className="dash-grid">
            <div className="dash-map">
              <div className="route-path path-one" />
              <div className="route-path path-two" />
              <span className="map-dot dot-a" />
              <span className="map-dot dot-b" />
              <span className="map-dot dot-c" />
              <div className="map-label">
                <Truck /> FP-204 <b>72 km/h</b>
              </div>
            </div>
            <div className="dash-side">
              <small>FLEET UTILIZATION</small>
              <strong>
                86<sup>%</sup>
              </strong>
              <span>24 vehicles in motion</span>
              <div className="dash-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className="dash-bottom">
            <span>
              <b>128</b> Active vehicles
            </span>
            <span>
              <b>18</b> Live trips
            </span>
            <span>
              <b>98.2%</b> On-time rate
            </span>
          </div>
        </div>
      </section>
      <section className="modules-section" id="results">
        <div className="modules-heading">
          <span className="section-index">03 / ONE SYSTEM. EVERY MOVE.</span>
          <h2>
            CONTROL WITHOUT
            <br />
            <i>THE CHAOS.</i>
          </h2>
        </div>
        <div className="modules-track">
          <article className="module-card dispatch-card">
            <div className="module-copy">
              <small>01 / DISPATCH</small>
              <h3>
                Routes that
                <br />
                think ahead.
              </h3>
              <p>
                Assign the right vehicle and driver before a constraint becomes
                a delay.
              </p>
            </div>
            <div className="module-art">
              <Route />
              <span className="path-dot p1" />
              <span className="path-dot p2" />
              <b>DEL → JAI</b>
              <div className="dispatch-eta">
                <Navigation /> ETA 18:40 <span>On time</span>
              </div>
            </div>
          </article>
          <article className="module-card safety-card">
            <div className="module-copy">
              <small>02 / SAFETY</small>
              <h3>
                Confidence in
                <br />
                every dispatch.
              </h3>
              <p>
                License, maintenance and safety signals checked in one live
                decision layer.
              </p>
            </div>
            <div className="module-art safety-orbit">
              <ShieldCheck />
              <span>98</span>
              <i>SAFETY SCORE</i>
              <div className="driver-badge">
                <b>RK</b>
                <span>
                  Ravi Kumar<small>Verified & ready</small>
                </span>
                <Check />
              </div>
            </div>
          </article>
          <article className="module-card finance-card">
            <div className="module-copy">
              <small>03 / COST CONTROL</small>
              <h3>
                Know what every
                <br />
                kilometer returns.
              </h3>
              <p>
                Connect fuel, service and trip economics without spreadsheet
                archaeology.
              </p>
            </div>
            <div className="module-art cost-bars">
              <CircleDollarSign />
              <b>₹ 24.8L</b>
              <span>Operating visibility</span>
              <div>
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <strong>+12.4% efficiency</strong>
            </div>
          </article>
        </div>
      </section>
      <footer className="landing-footer">
        <div>
          <Logo light />
          <h2>
            Ready to put your
            <br />
            fleet in motion?
          </h2>
          <a className="footer-cta" href="/signup">
            Create your workspace <ArrowUpRight />
          </a>
        </div>
        <div className="footer-meta">
          <span>FLEETPILOT © 2026</span>
          <span>OPERATIONS, ORCHESTRATED.</span>
        </div>
      </footer>
    </main>
  );
}

function AuthPage({
  onLogin,
  initialMode,
}: {
  onLogin: (u: User) => void;
  initialMode: "login" | "register";
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(
    initialMode === "login"
      ? {
          name: "",
          companyName: "",
          email: "owner@transitops.in",
          password: "Password@123",
        }
      : { name: "", companyName: "", email: "", password: "" },
  );
  const [googleCredential, setGoogleCredential] = useState<string | null>(null);
  const googleButton = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const finish = (out: { user: User }) => {
    history.replaceState({}, "", "/");
    onLogin(out.user);
  };
  const changeMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    setGoogleCredential(null);
    setForm(
      next === "login"
        ? {
            name: "",
            companyName: "",
            email: "owner@transitops.in",
            password: "Password@123",
          }
        : { name: "", companyName: "", email: "", password: "" },
    );
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const out =
        mode === "register" && googleCredential
          ? await api<{ user: User }>("/auth/google", {
              method: "POST",
              body: JSON.stringify({
                credential: googleCredential,
                intent: "register",
                companyName: form.companyName,
              }),
            })
          : await api<{ user: User }>(
              mode === "login" ? "/auth/login" : "/auth/register",
              { method: "POST", body: JSON.stringify(form) },
            );
      finish(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || googleCredential) return;
    const render = () => {
      if (!window.google || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setError("");
          if (modeRef.current === "register") {
            try {
              const raw = credential
                .split(".")[1]
                .replace(/-/g, "+")
                .replace(/_/g, "/");
              const encoded = raw.padEnd(Math.ceil(raw.length / 4) * 4, "=");
              const profile = JSON.parse(
                new TextDecoder().decode(
                  Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
                ),
              ) as { name?: string; email?: string };
              if (googleButton.current) googleButton.current.replaceChildren();
              setForm((current) => ({
                ...current,
                name: profile.name || current.name,
                email: profile.email || current.email,
              }));
              setGoogleCredential(credential);
            } catch {
              setError(
                "Google account details read nahi ho paaye. Please try again.",
              );
            }
            return;
          }
          setBusy(true);
          try {
            const out = await api<{ user: User }>("/auth/google", {
              method: "POST",
              body: JSON.stringify({ credential, intent: "login" }),
            });
            finish(out);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      });
      googleButton.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButton.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 420,
        text: mode === "login" ? "signin_with" : "signup_with",
      });
    };
    if (window.google) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [mode, googleCredential]);
  return (
    <main className="auth-page">
      <section className="auth-story">
        <button className="auth-back" onClick={() => location.assign("/")}>
          <ArrowLeft /> Back to FleetPilot
        </button>
        <div>
          <span className="eyebrow">Enterprise fleet access</span>
          <h1>
            One identity.
            <br />
            <i>Every operation.</i>
          </h1>
          <p>
            Secure access for transport owners and their operating teams, with
            permissions resolved automatically inside each company workspace.
          </p>
          <div className="auth-trust">
            <span>
              <ShieldCheck /> Tenant-isolated data
            </span>
            <span>
              <LockKeyhole /> Server-enforced roles
            </span>
          </div>
        </div>
        <small>FLEETPILOT / INTELLIGENT FLEET OPERATIONS</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <Logo />
          <div className="auth-switch">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => changeMode("login")}
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => changeMode("register")}
            >
              Create company
            </button>
          </div>
          <span className="eyebrow">
            {mode === "login" ? "Workspace access" : "Owner onboarding"}
          </span>
          <h2>{mode === "login" ? "Welcome back." : "Lead your fleet."}</h2>
          <p>
            {mode === "login"
              ? "Owner, admin and employees use the same secure sign-in."
              : "Set up the transport company. This first account becomes its protected Owner."}
          </p>
          {error && (
            <div className="alert">
              <X size={17} />
              <span>
                <b>
                  {mode === "login"
                    ? "Unable to sign in"
                    : "Unable to create company"}
                </b>
                {error}
              </span>
            </div>
          )}
          {googleCredential ? (
            <div key="google-connected" className="google-connected">
              <span className="google-verified-icon">
                <GoogleLogo />
                <i>
                  <Check />
                </i>
              </span>
              <span>
                <b>Google account verified</b>
                {form.email}
              </span>
              <button
                type="button"
                onClick={() => {
                  setGoogleCredential(null);
                  setForm((current) => ({ ...current, name: "", email: "" }));
                }}
              >
                Use another
              </button>
            </div>
          ) : (
            <div key="google-button" ref={googleButton} className="google-auth">
              {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <button
                  type="button"
                  className="google-fallback"
                  onClick={() =>
                    setError(
                      "Google sign-in activate karne ke liye OAuth Client ID configure karna hoga. Email login abhi ready hai.",
                    )
                  }
                >
                  <GoogleLogo />
                  <span>
                    {mode === "login"
                      ? "Sign in with Google"
                      : "Sign up with Google"}
                    <small>Use your work Google account</small>
                  </span>
                </button>
              )}
            </div>
          )}
          <div className="auth-divider">
            <span>
              {googleCredential
                ? "complete your company details"
                : "or continue with work email"}
            </span>
          </div>
          <form onSubmit={submit}>
            {mode === "register" && (
              <div className="auth-two">
                <Field label="Your full name">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Aarav Sharma"
                    readOnly={Boolean(googleCredential)}
                    required
                  />
                </Field>
                <Field label="Transport company">
                  <input
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    placeholder="Northstar Logistics"
                    required
                  />
                </Field>
              </div>
            )}
            <Field label="Work email">
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                readOnly={Boolean(googleCredential)}
                required
              />
            </Field>
            {(!googleCredential || mode === "login") && (
              <Field label="Password">
                <input
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  minLength={mode === "register" ? 10 : 8}
                  required
                />
              </Field>
            )}
            {mode === "login" ? (
              <div className="form-meta">
                <label>
                  <input type="checkbox" defaultChecked /> Keep me signed in
                </label>
                <a href="/forgot-password">Forgot password?</a>
              </div>
            ) : (
              <div className="owner-note">
                <ShieldCheck />
                <span>
                  <b>Owner-level protection</b>Only the Owner can manage
                  administrator access. Roles are never selected during sign-in.
                </span>
              </div>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in securely"
                  : "Create company workspace"}{" "}
              <ShieldCheck size={18} />
            </Button>
          </form>
          {mode === "login" && (
            <div className="demo-note">
              <Check size={16} />
              <span>
                Owner demo: <b>owner@transitops.in</b> · <b>Password@123</b>
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

type Page =
  | "dashboard"
  | "vehicles"
  | "drivers"
  | "driver-access"
  | "trips"
  | "profitability"
  | "maintenance"
  | "finance"
  | "analytics"
  | "settings"
  | "access"
  | "profile";
type MaintenanceDraft = { vehicleId: string; vehicleName: string };
type FuelDraft = {
  vehicleId: string;
  vehicleName: string;
  liters?: number;
  cost?: number;
  odometerKm?: number;
};
type SearchTarget = { type: GlobalSearchResult["type"]; id: string };
type WorkflowHandoffEvent = CustomEvent<{
  type: "OPEN_MAINTENANCE_FORM" | "OPEN_FUEL_FORM";
  payload: MaintenanceDraft | FuelDraft;
}>;
const nav: Array<{ id: Page; label: string; icon: any; roles?: Role[] }> = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  {
    id: "vehicles",
    label: "Fleet registry",
    icon: Truck,
    roles: ["FLEET_MANAGER"],
  },
  {
    id: "drivers",
    label: "Drivers",
    icon: UsersRound,
    roles: ["FLEET_MANAGER", "SAFETY_OFFICER"],
  },
  {
    id: "trips",
    label: "Trip dispatch",
    icon: Route,
    roles: ["DISPATCHER", "FLEET_MANAGER"],
  },
  {
    id: "profitability",
    label: "Profitability",
    icon: CircleDollarSign,
    roles: ["DISPATCHER", "FLEET_MANAGER", "FINANCIAL_ANALYST"],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    roles: ["FLEET_MANAGER"],
  },
  {
    id: "finance",
    label: "Fuel & expenses",
    icon: Fuel,
    roles: ["FINANCIAL_ANALYST", "FLEET_MANAGER"],
  },
  {
    id: "analytics",
    label: "Reports",
    icon: BarChart3,
    roles: ["OWNER", "ADMIN", "FLEET_MANAGER", "FINANCIAL_ANALYST"],
  },
  {
    id: "driver-access",
    label: "Driver access",
    icon: UsersRound,
    roles: ["FLEET_MANAGER"],
  },
  {
    id: "settings",
    label: "Company settings",
    icon: Settings,
    roles: ["OWNER", "ADMIN"],
  },
  {
    id: "access",
    label: "User access",
    icon: ShieldCheck,
    roles: ["OWNER", "ADMIN"],
  },
];
function GlobalSearch({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: GlobalSearchResult) => void;
}) {
  const [results, setResults] = useState<GlobalSearchResult[]>([]),
    [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
      "idle",
    ),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    query = value.trim();
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(query.length >= 2);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [query.length]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setState("idle");
      setActive(-1);
      return;
    }
    let current = true;
    setState("loading");
    setOpen(true);
    const timer = window.setTimeout(
      () =>
        api<GlobalSearchResponse>(`/search?q=${encodeURIComponent(query)}`)
          .then((response) => {
            if (current) {
              setResults(response.results);
              setState("ready");
              setActive(response.results.length ? 0 : -1);
            }
          })
          .catch(() => {
            if (current) {
              setResults([]);
              setState("error");
              setActive(-1);
            }
          }),
      250,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query]);
  const choose = (result: GlobalSearchResult) => {
    onSelect(result);
    setOpen(false);
    setActive(-1);
  };
  const keyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) =>
        results.length ? (index + 1) % results.length : -1,
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) =>
        results.length ? (index <= 0 ? results.length - 1 : index - 1) : -1,
      );
    }
    if (event.key === "Enter" && open && active >= 0 && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  };
  const groups: Array<{
    type: GlobalSearchResult["type"];
    label: string;
    icon: any;
  }> = [
    { type: "DRIVER", label: "Drivers", icon: UserRound },
    { type: "VEHICLE", label: "Vehicles", icon: Truck },
    { type: "TRIP", label: "Trips", icon: Route },
  ];
  return (
    <div className="global-search" ref={root}>
      <Search />
      <input
        ref={input}
        role="combobox"
        aria-label="Search vehicles, drivers or trips"
        aria-autocomplete="list"
        aria-expanded={open && query.length >= 2}
        aria-controls="global-search-results"
        aria-activedescendant={
          active >= 0 ? `global-result-${active}` : undefined
        }
        placeholder="Search vehicles, drivers or trips…"
        value={value}
        onFocus={() => query.length >= 2 && setOpen(true)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keyDown}
      />
      {value && (
        <button
          type="button"
          className="global-search-clear"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X />
        </button>
      )}
      {open && query.length >= 2 && (
        <div
          className="global-results"
          id="global-search-results"
          role="listbox"
          aria-label="Fleet search results"
        >
          <div className="global-results-head">
            <span>Search workspace</span>
            {state === "ready" && (
              <small>
                {results.length} result{results.length === 1 ? "" : "s"}
              </small>
            )}
          </div>
          {state === "loading" && (
            <div className="global-search-state">
              <i />
              Searching fleet records…
            </div>
          )}
          {state === "error" && (
            <div className="global-search-state error">
              <AlertTriangle />
              Search is temporarily unavailable. Try again.
            </div>
          )}
          {state === "ready" && !results.length && (
            <div className="global-search-state">
              <Search />
              No driver, vehicle or trip matches “{query}”.
            </div>
          )}
          {state === "ready" &&
            groups.map((group) => {
              const items = results.filter(
                (result) => result.type === group.type,
              );
              if (!items.length) return null;
              return (
                <section className="global-result-group" key={group.type}>
                  <h4>{group.label}</h4>
                  {items.map((result) => {
                    const index = results.indexOf(result),
                      Icon = group.icon;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active === index}
                        id={`global-result-${index}`}
                        key={`${result.type}-${result.id}`}
                        className={active === index ? "active" : ""}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(result)}
                      >
                        <span
                          className={`global-result-icon ${result.type.toLowerCase()}`}
                        >
                          <Icon />
                        </span>
                        <span>
                          <b>{result.title}</b>
                          <small>{result.subtitle}</small>
                          {result.context && <em>{result.context}</em>}
                        </span>
                        <Status value={result.meta} />
                        <ExternalLink />
                      </button>
                    );
                  })}
                </section>
              );
            })}
          <footer>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> Navigate
            </span>
            <span>
              <kbd>↵</kbd> Open
            </span>
            <span>
              <kbd>esc</kbd> Close
            </span>
          </footer>
        </div>
      )}
    </div>
  );
}
const notificationAge = (value: string) => {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : date(value);
};
function NotificationCenter({
  canOpenTrips,
  onOpenTrip,
}: {
  canOpenTrips: boolean;
  onOpenTrip: (tripId: string) => void;
}) {
  const [items, setItems] = useState<AppNotification[]>([]),
    [unread, setUnread] = useState(0),
    [open, setOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      const data = await api<NotificationResponse>("/notifications?limit=30");
      setItems(data.items);
      setUnread(data.unreadCount);
      setError("");
    } catch {
      setError("Notifications could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15_000);
    const focus = () => load();
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const markRead = async (item: AppNotification) => {
    if (!item.readAt) {
      setItems((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, readAt: new Date().toISOString() }
            : row,
        ),
      );
      setUnread((current) => Math.max(0, current - 1));
      try {
        await api(`/notifications/${item.id}/read`, { method: "POST" });
      } catch {
        load();
      }
    }
    if (item.tripId && canOpenTrips) onOpenTrip(item.tripId);
    setOpen(false);
  };
  const markAll = async () => {
    if (!unread) return;
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((row) => ({ ...row, readAt: row.readAt || now })),
    );
    setUnread(0);
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch {
      load();
    }
  };
  const tone = (item: AppNotification) =>
    item.type === "TRIP_COMPLETED"
      ? "green"
      : item.type === "TRIP_CANCELLED"
        ? "red"
        : item.type === "TRIP_STARTED"
          ? "orange"
          : "blue";
  return (
    <div className="notification-center" ref={root}>
      <button
        className={`icon-btn notification-trigger ${open ? "active" : ""}`}
        aria-label={
          unread ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) load();
        }}
      >
        <Bell />
        {unread > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notification-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <header className="notification-head">
            <div>
              <b>Notifications</b>
              <small>
                {unread ? `${unread} unread` : "You’re all caught up"}
              </small>
            </div>
            <button type="button" onClick={markAll} disabled={!unread}>
              Mark all read
            </button>
          </header>
          <div className="notification-list" aria-live="polite">
            {loading && !items.length && (
              <div className="notification-state">
                <i />
                Syncing notifications…
              </div>
            )}
            {error && !items.length && (
              <div className="notification-state error">
                <AlertTriangle />
                {error}
              </div>
            )}
            {!loading && !error && !items.length && (
              <div className="notification-empty">
                <Bell />
                <b>No notifications yet</b>
                <span>Trip activity for your role will appear here.</span>
              </div>
            )}
            {items.map((item) => (
              <button
                type="button"
                className={`notification-item ${item.readAt ? "" : "unread"}`}
                key={item.id}
                onClick={() => markRead(item)}
              >
                <span className={`notification-dot ${tone(item)}`} />
                <span>
                  <b>{item.title}</b>
                  <small>{item.message}</small>
                  <em>
                    {notificationAge(item.createdAt)}
                    {item.tripId && canOpenTrips ? " · Open trip" : ""}
                  </em>
                </span>
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <footer>Updates refresh automatically every 15 seconds</footer>
          )}
        </section>
      )}
    </div>
  );
}
function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [currentUser, setCurrentUser] = useState(user);
  const [page, setPage] = useState<Page>("dashboard");
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [newTripRequested, setNewTripRequested] = useState(false);
  const [maintenanceDraft, setMaintenanceDraft] =
    useState<MaintenanceDraft | null>(null);
  const [fuelDraft, setFuelDraft] = useState<FuelDraft | null>(null);
  useEffect(() => {
    const refresh = () =>
      api<User & { allowedModules: string[] }>("/profile")
        .then(setCurrentUser)
        .catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Owners and administrators manage the complete organization; employee menus stay role-scoped.
  const privileged = ["OWNER", "ADMIN"].includes(currentUser.role);
  const visible = nav.filter(
    (n) => privileged || !n.roles || n.roles.includes(currentUser.role),
  );
  const canCreateTrip = [
    "OWNER",
    "ADMIN",
    "FLEET_MANAGER",
    "DISPATCHER",
  ].includes(currentUser.role);
  const startNewTrip = () => {
    if (!canCreateTrip) return;
    setNewTripRequested(true);
    setPage("trips");
    setMenu(false);
  };
  const openSearchResult = (result: GlobalSearchResult) => {
    setSearchTarget({ type: result.type, id: result.id });
    setPage(
      result.type === "DRIVER"
        ? "drivers"
        : result.type === "VEHICLE"
          ? "vehicles"
          : "trips",
    );
    setSearch("");
    setMenu(false);
  };
  const canOpenNotificationTrip = [
    "OWNER",
    "ADMIN",
    "FLEET_MANAGER",
    "DISPATCHER",
  ].includes(currentUser.role);
  const openNotificationTrip = (tripId: string) => {
    if (!canOpenNotificationTrip) return;
    setSearchTarget({ type: "TRIP", id: tripId });
    setPage("trips");
    setMenu(false);
  };
  useEffect(() => {
    const handle = (event: Event) => {
      const handoff = (event as WorkflowHandoffEvent).detail;
      if (handoff?.type === "OPEN_MAINTENANCE_FORM") {
        setMaintenanceDraft(handoff.payload as MaintenanceDraft);
        setPage("maintenance");
      }
      if (handoff?.type === "OPEN_FUEL_FORM") {
        setFuelDraft(handoff.payload as FuelDraft);
        setPage("finance");
      }
      setMenu(false);
    };
    window.addEventListener("fleetpilot:workflow-handoff", handle);
    return () =>
      window.removeEventListener("fleetpilot:workflow-handoff", handle);
  }, []);
  const NavButton = ({ n }: { n: (typeof nav)[number] }) => (
    <button
      key={n.id}
      title={collapsed ? n.label : undefined}
      className={page === n.id ? "active" : ""}
      onClick={() => {
        setPage(n.id);
        setMenu(false);
      }}
    >
      <n.icon size={19} />
      <span>{n.label}</span>
    </button>
  );
  const operations = visible.filter(
    (n) => !["driver-access", "settings", "access"].includes(n.id),
  );
  const administration = visible.filter((n) =>
    ["driver-access", "settings", "access"].includes(n.id),
  );
  return (
    <div className="app">
      <aside
        className={`${menu ? "open " : ""}${collapsed ? "collapsed" : ""}`}
      >
        <div className="aside-head">
          <div
            className="brand-toggle"
            role="button"
            tabIndex={0}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setCollapsed((v) => !v);
              }
            }}
          >
            <Logo />
          </div>
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace">
          <span>Workspace</span>
          <b>{currentUser.organizationName}</b>
          <ChevronDown size={15} />
        </div>
        <nav>
          <span className="nav-label">OPERATIONS</span>
          {operations.map((n) => (
            <NavButton key={n.id} n={n} />
          ))}
          {administration.length > 0 && (
            <>
              <span className="nav-label">ADMINISTRATION</span>
              {administration.map((n) => (
                <NavButton key={n.id} n={n} />
              ))}
            </>
          )}
        </nav>
        <div className="user-card">
          <button
            className="avatar-button"
            onClick={() => {
              setPage("profile");
              setMenu(false);
            }}
            title="Open my profile"
          >
            <UserAvatar user={currentUser} />
          </button>
          <div>
            <b>{currentUser.name}</b>
            <span>{roleLabel[currentUser.role]}</span>
          </div>
          <button onClick={onLogout} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <section className="app-main">
        <header>
          <button
            className="menu-btn"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <GlobalSearch
            value={search}
            onChange={setSearch}
            onSelect={openSearchResult}
          />
          <div className="header-actions">
            <button
              className="copilot-trigger"
              onClick={() => setCopilotOpen(true)}
              aria-label="Open FleetPilot Copilot"
            >
              <Sparkles />
              <span>Ask Copilot</span>
            </button>
            <NotificationCenter
              canOpenTrips={canOpenNotificationTrip}
              onOpenTrip={openNotificationTrip}
            />
            <span className="date-chip">
              <CalendarDays size={16} />
              {new Intl.DateTimeFormat("en-IN", {
                day: "numeric",
                month: "short",
              }).format(new Date())}
            </span>
            <button
              className={`profile-trigger ${page === "profile" ? "active" : ""}`}
              onClick={() => setPage("profile")}
              aria-label="Open my profile"
            >
              <UserAvatar user={currentUser} />
              <span>
                <b>{currentUser.name}</b>
                <small>{roleLabel[currentUser.role]}</small>
              </span>
              <ChevronDown />
            </button>
          </div>
        </header>
        <div className="content">
          <PageContent
            page={page}
            user={currentUser}
            globalSearch={search}
            searchTarget={searchTarget}
            onSearchTargetHandled={() => setSearchTarget(null)}
            onUserChange={setCurrentUser}
            newTripRequested={newTripRequested}
            onNewTrip={startNewTrip}
            onNewTripRequestHandled={() => setNewTripRequested(false)}
            maintenanceDraft={maintenanceDraft}
            onMaintenanceDraftHandled={() => setMaintenanceDraft(null)}
            fuelDraft={fuelDraft}
            onFuelDraftHandled={() => setFuelDraft(null)}
          />
        </div>
      </section>
      <ChatDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        user={currentUser}
        page={page}
      />
    </div>
  );
}

function PageContent({
  page,
  user,
  globalSearch,
  searchTarget,
  onSearchTargetHandled,
  onUserChange,
  newTripRequested,
  onNewTrip,
  onNewTripRequestHandled,
  maintenanceDraft,
  onMaintenanceDraftHandled,
  fuelDraft,
  onFuelDraftHandled,
}: {
  page: Page;
  user: User;
  globalSearch: string;
  searchTarget: SearchTarget | null;
  onSearchTargetHandled: () => void;
  onUserChange: (user: User) => void;
  newTripRequested: boolean;
  onNewTrip: () => void;
  onNewTripRequestHandled: () => void;
  maintenanceDraft: MaintenanceDraft | null;
  onMaintenanceDraftHandled: () => void;
  fuelDraft: FuelDraft | null;
  onFuelDraftHandled: () => void;
}) {
  const canCreateTrip = [
    "OWNER",
    "ADMIN",
    "FLEET_MANAGER",
    "DISPATCHER",
  ].includes(user.role);
  if (page === "dashboard")
    return (
      <Dashboard
        user={user}
        onNewTrip={canCreateTrip ? onNewTrip : undefined}
      />
    );
  if (page === "vehicles")
    return (
      <Vehicles
        user={user}
        globalSearch={globalSearch}
        selectedId={searchTarget?.type === "VEHICLE" ? searchTarget.id : null}
        onSelectedHandled={onSearchTargetHandled}
      />
    );
  if (page === "drivers")
    return (
      <Drivers
        user={user}
        globalSearch={globalSearch}
        selectedId={searchTarget?.type === "DRIVER" ? searchTarget.id : null}
        onSelectedHandled={onSearchTargetHandled}
      />
    );
  if (page === "driver-access") return <DriverAccessPage user={user} />;
  if (page === "trips")
    return (
      <Trips
        openCreate={newTripRequested}
        onOpenCreateHandled={onNewTripRequestHandled}
        selectedId={searchTarget?.type === "TRIP" ? searchTarget.id : null}
        onSelectedHandled={onSearchTargetHandled}
      />
    );
  if (page === "profitability") return <ProfitabilityPage />;
  if (page === "maintenance")
    return (
      <MaintenancePage
        initialDraft={maintenanceDraft}
        onInitialDraftHandled={onMaintenanceDraftHandled}
      />
    );
  if (page === "finance")
    return (
      <FinancePage
        initialFuel={fuelDraft}
        onInitialFuelHandled={onFuelDraftHandled}
      />
    );
  if (page === "analytics") return <Analytics />;
  if (page === "access") return <TeamAccessPage user={user} />;
  if (page === "profile")
    return <ProfilePage user={user} onUserChange={onUserChange} />;
  return <SettingsPage user={user} />;
}

function Dashboard({
  user,
  onNewTrip,
}: {
  user: User;
  onNewTrip?: () => void;
}) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setError("");
    api("/dashboard")
      .then(setData)
      .catch((error) => setError((error as Error).message));
  }, [retry]);
  if (error && !data)
    return (
      <div className="alert profile-alert">
        <AlertTriangle />
        <span>
          <b>Dashboard could not load</b>
          {error}
        </span>
        <Button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </Button>
      </div>
    );
  if (!data) return <Loading />;
  const cards = [
    ["Active vehicles", data.kpis.activeVehicles, BusFront, "blue"],
    ["Available now", data.kpis.availableVehicles, Check, "green"],
    ["In maintenance", data.kpis.inMaintenance, Wrench, "orange"],
    ["Active trips", data.kpis.activeTrips, Route, "purple"],
    ["Drivers on duty", data.kpis.driversOnDuty, UsersRound, "cyan"],
    ["Fleet utilization", `${data.kpis.fleetUtilization}%`, Gauge, "navy"],
  ];
  const statusData = Object.entries(data.vehicleStatus).map(
    ([name, value]) => ({ name: pretty(name), value }),
  );
  return (
    <>
      <PageTitle
        eyebrow="Operations center"
        title={`Good evening, ${user.name}`}
        description="Here’s what’s happening across your transport network today."
        action={
          onNewTrip ? (
            <Button onClick={onNewTrip}>
              <Plus size={17} /> New trip
            </Button>
          ) : undefined
        }
      />
      <div className="notice">
        <span>
          <Activity size={18} />
        </span>
        <div>
          <b>All systems operational</b>
          <p>Fleet data last synchronized just now</p>
        </div>
        <i />
      </div>
      <div className="kpi-grid">
        {cards.map(([label, value, Icon, color]: any) => (
          <div className="kpi" key={label}>
            <div className={`kpi-icon ${color}`}>
              <Icon />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>Live fleet status</small>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <span>Live operations</span>
              <h3>Recent trips</h3>
            </div>
            <button>
              View all <span>→</span>
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Route</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrips.map((t: Trip) => (
                  <tr key={t.id}>
                    <td>
                      <b>{t.tripNo}</b>
                    </td>
                    <td>
                      {t.source} <span className="route-arrow">→</span>{" "}
                      {t.destination}
                    </td>
                    <td>{t.vehicle.name}</td>
                    <td>{t.driver.name}</td>
                    <td>
                      <Status value={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span>Distribution</span>
              <h3>Vehicle status</h3>
            </div>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{ "--percent": `${data.kpis.fleetUtilization}%` } as any}
            >
              <b>{data.kpis.activeVehicles}</b>
              <span>Total fleet</span>
            </div>
            <div className="legend">
              {statusData.map((x: any, i) => (
                <div key={x.name}>
                  <i className={`dot d${i}`} />
                  <span>{x.name}</span>
                  <b>{x.value as number}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
function Loading() {
  return (
    <div className="loading">
      <span />
      <p>Loading operations…</p>
    </div>
  );
}

function Toolbar({
  search,
  setSearch,
  children,
}: {
  search: string;
  setSearch: (s: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <Search />
        <input
          placeholder="Search records…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {children}
    </div>
  );
}
type Profile = User & { allowedModules: string[] };
function ProfilePage({
  user,
  onUserChange,
}: {
  user: User;
  onUserChange: (user: User) => void;
}) {
  const [profile, setProfile] = useState<Profile>({
    ...user,
    allowedModules: [],
  });
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone || "",
    jobTitle: user.jobTitle || "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const applyProfile = (next: Profile) => {
    setProfile(next);
    setForm({
      name: next.name,
      phone: next.phone || "",
      jobTitle: next.jobTitle || "",
    });
    onUserChange(next);
  };
  useEffect(() => {
    api<Profile>("/profile")
      .then(applyProfile)
      .catch((e) => setError((e as Error).message));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await api<Profile>("/profile", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      applyProfile(next);
      setMessage("Personal details updated");
      setTimeout(() => setMessage(""), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("Profile photo must be 20 MB or smaller");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("avatar", file);
      const next = await api<Profile>("/profile/avatar", {
        method: "POST",
        body: data,
      });
      applyProfile(next);
      setMessage("Profile photo updated");
      setTimeout(() => setMessage(""), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  const moduleIcons: Record<string, typeof LayoutDashboard> = {
    Overview: LayoutDashboard,
    "Fleet registry": Truck,
    Drivers: UsersRound,
    "Driver access": UsersRound,
    "Trip dispatch": Route,
    Profitability: CircleDollarSign,
    Maintenance: Wrench,
    "Fuel & expenses": Fuel,
    Reports: BarChart3,
    "Company settings": Settings,
    "User access": ShieldCheck,
  };
  return (
    <>
      <PageTitle
        eyebrow="Personal account"
        title="My profile"
        description="Manage your identity, profile photo and the FleetPilot modules available to you."
      />
      {message && (
        <div className="notice compact">
          <span>
            <Check />
          </span>
          <div>
            <b>{message}</b>
          </div>
        </div>
      )}
      {error && (
        <div className="alert profile-alert">
          <X />
          <span>
            <b>Unable to update profile</b>
            {error}
          </span>
        </div>
      )}
      <div className="profile-grid">
        <section className="panel profile-identity">
          <div className="profile-cover">
            <span>FP / IDENTITY</span>
          </div>
          <div className="profile-photo-wrap">
            <label
              className={`profile-photo-picker ${busy ? "disabled" : ""}`}
              htmlFor="profile-avatar-input"
            >
              <UserAvatar user={profile} size="large" />
              <span className="profile-camera">
                <Camera />
              </span>
              <input
                id="profile-avatar-input"
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                aria-label="Upload profile photo"
                disabled={busy}
                onChange={(e) => uploadAvatar(e.target.files?.[0])}
              />
            </label>
          </div>
          <div className="profile-summary">
            <h2>{profile.name}</h2>
            <p>{profile.jobTitle || roleLabel[profile.role]}</p>
            <label
              className={`change-photo ${busy ? "disabled" : ""}`}
              htmlFor="profile-avatar-input"
            >
              <Camera />
              {busy ? "Uploading…" : "Change profile photo"}
            </label>
            <span>
              <ShieldCheck /> {roleLabel[profile.role]}
            </span>
          </div>
          <div className="profile-facts">
            <div>
              <Mail />
              <span>
                <small>Work email</small>
                <b>{profile.email}</b>
              </span>
            </div>
            <div>
              <Building2 />
              <span>
                <small>Workspace</small>
                <b>{profile.organizationName}</b>
              </span>
            </div>
            <div>
              <LockKeyhole />
              <span>
                <small>Account ID</small>
                <b>{profile.id}</b>
              </span>
            </div>
          </div>
          <p className="avatar-note">
            JPG, PNG, WebP or HEIC · maximum 20 MB · stored privately
          </p>
        </section>
        <div className="profile-main">
          <form className="panel profile-form" onSubmit={save}>
            <div className="panel-head">
              <div>
                <span>Personal settings</span>
                <h3>Your details</h3>
              </div>
              <small>Email and role are managed by your workspace</small>
            </div>
            <div className="profile-form-fields">
              <Field label="Full name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
              <Field label="Work email">
                <input value={profile.email} readOnly />
              </Field>
              <Field label="Phone number">
                <div className="input-with-icon">
                  <Phone />
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    maxLength={30}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </Field>
              <Field label="Job title">
                <div className="input-with-icon">
                  <BriefcaseBusiness />
                  <input
                    value={form.jobTitle}
                    onChange={(e) =>
                      setForm({ ...form, jobTitle: e.target.value })
                    }
                    maxLength={80}
                    placeholder="Operations manager"
                  />
                </div>
              </Field>
            </div>
            <div className="profile-form-actions">
              <span>
                <ShieldCheck /> Changes apply across FleetPilot immediately.
              </span>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save personal details"}
              </Button>
            </div>
          </form>
          <section className="panel profile-modules">
            <div className="panel-head">
              <div>
                <span>Role permissions</span>
                <h3>Your allowed modules</h3>
              </div>
              <span className="module-count">
                {profile.allowedModules.length} enabled
              </span>
            </div>
            <div className="module-access-grid">
              {profile.allowedModules.map((module) => {
                const Icon = moduleIcons[module] || LayoutDashboard;
                return (
                  <div key={module}>
                    <span>
                      <Icon />
                    </span>
                    <div>
                      <b>{module}</b>
                      <small>Available with {roleLabel[profile.role]}</small>
                    </div>
                    <Check />
                  </div>
                );
              })}
            </div>
            {!profile.allowedModules.length && (
              <div className="profile-modules-loading">
                Loading your module access…
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Vehicles({
  user,
  globalSearch,
  selectedId,
  onSelectedHandled,
}: {
  user: User;
  globalSearch: string;
  selectedId: string | null;
  onSelectedHandled: () => void;
}) {
  const [rows, setRows] = useState<Vehicle[]>([]),
    [search, setSearch] = useState(globalSearch),
    [status, setStatus] = useState(""),
    [edit, setEdit] = useState<Vehicle | Partial<Vehicle> | null>(null),
    [selected, setSelected] = useState<Vehicle | null>(null);
  const can = ["OWNER", "ADMIN", "FLEET_MANAGER"].includes(user.role);
  const load = useCallback(
    () =>
      api<Vehicle[]>(
        `/vehicles?q=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`,
      ).then(setRows),
    [search, status],
  );
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setSearch(globalSearch), [globalSearch]);
  useEffect(() => {
    if (!selectedId) return;
    const match = rows.find((row) => row.id === selectedId);
    if (match) {
      setSelected(match);
      onSelectedHandled();
    }
  }, [selectedId, rows, onSelectedHandled]);
  async function remove(v: Vehicle) {
    if (confirm(`Delete ${v.name}?`)) {
      await api(`/vehicles/${v.id}`, { method: "DELETE" });
      load();
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="Fleet operations"
        title="Vehicle registry"
        description={`${rows.length} vehicles · central source of truth for your fleet`}
        action={
          can ? (
            <Button onClick={() => setEdit({})}>
              <Plus size={17} /> Add vehicle
            </Button>
          ) : undefined
        }
      />
      <Toolbar search={search} setSearch={setSearch}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["AVAILABLE", "ON_TRIP", "IN_SHOP", "RETIRED"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Toolbar>
      <section className="panel records">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Registration</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Licence</th>
                <th>Odometer</th>
                <th>Acquisition</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  className="vehicle-row"
                  key={v.id}
                  tabIndex={0}
                  onClick={() => setSelected(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(v);
                    }
                  }}
                >
                  <td>
                    <div className="entity">
                      <span>
                        <Truck />
                      </span>
                      <div>
                        <b>{v.name}</b>
                        <small>{v.region} region</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code>{v.registrationNo}</code>
                  </td>
                  <td>{v.type}</td>
                  <td>{v.capacityKg.toLocaleString()} kg</td>
                  <td>
                    <code>{v.requiredLicenseCategory}</code>
                  </td>
                  <td>{v.odometerKm.toLocaleString()} km</td>
                  <td>{money(v.acquisitionCost)}</td>
                  <td>
                    <Status value={v.status} />
                  </td>
                  <td className="actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(v);
                      }}
                    >
                      Details
                    </button>
                    {can && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEdit(v);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(v);
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty />}
        </div>
      </section>
      {selected && (
        <VehicleDetail vehicle={selected} onClose={() => setSelected(null)} />
      )}{" "}
      {edit && (
        <VehicleForm
          value={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </>
  );
}
function VehicleDetail({
  vehicle,
  onClose,
}: {
  vehicle: Vehicle;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<VehicleDetails | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<VehicleDetails>(`/vehicles/${vehicle.id}/details`)
      .then((value) => {
        if (active) setDetails(value);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [vehicle.id]);
  return (
    <Modal title={vehicle.name} onClose={onClose} wide>
      <div className="vehicle-detail">
        {error && (
          <div className="alert">
            <X />
            <span>
              <b>Unable to load vehicle details</b>
              {error}
            </span>
          </div>
        )}
        {!details && !error && (
          <div className="vehicle-detail-loading">
            <Activity /> Loading complete vehicle history…
          </div>
        )}
        {details && (
          <>
            <section className="vehicle-detail-hero">
              <div className="vehicle-hero-icon">
                <Truck />
              </div>
              <div>
                <span>{details.vehicle.registrationNo}</span>
                <h3>{details.vehicle.name}</h3>
                <p>
                  {details.vehicle.type} · {details.vehicle.region} region
                </p>
              </div>
              <Status value={details.vehicle.status} />
            </section>
            <div className="vehicle-detail-kpis">
              <div>
                <Gauge />
                <span>
                  Current odometer
                  <b>{details.vehicle.odometerKm.toLocaleString("en-IN")} km</b>
                </span>
              </div>
              <div>
                <Route />
                <span>
                  Completed distance
                  <b>
                    {details.summary.totalDistanceKm.toLocaleString("en-IN")} km
                  </b>
                </span>
              </div>
              <div>
                <UsersRound />
                <span>
                  Drivers used<b>{details.driverUsage.length}</b>
                </span>
              </div>
              <div>
                <Wrench />
                <span>
                  Maintenance spend
                  <b>{money(details.summary.maintenanceCost)}</b>
                </span>
              </div>
            </div>
            <section className="vehicle-facts">
              <div>
                <span>Vehicle type</span>
                <b>{details.vehicle.type}</b>
              </div>
              <div>
                <span>Load capacity</span>
                <b>{details.vehicle.capacityKg.toLocaleString("en-IN")} kg</b>
              </div>
              <div>
                <span>Required licence</span>
                <b>{details.vehicle.requiredLicenseCategory}</b>
              </div>
              <div>
                <span>Acquisition cost</span>
                <b>{money(details.vehicle.acquisitionCost)}</b>
              </div>
              <div>
                <span>Added to fleet</span>
                <b>{date(details.vehicle.createdAt)}</b>
              </div>
              <div>
                <span>Total operating spend</span>
                <b>
                  {money(
                    details.summary.maintenanceCost +
                      details.summary.fuelCost +
                      details.summary.otherExpenses,
                  )}
                </b>
              </div>
            </section>
            {details.activeTrip && (
              <section className="vehicle-active-trip">
                <Activity />
                <div>
                  <span>Currently assigned</span>
                  <b>
                    {details.activeTrip.driver.name} ·{" "}
                    {details.activeTrip.tripNo}
                  </b>
                  <small>
                    {details.activeTrip.source} →{" "}
                    {details.activeTrip.destination}
                  </small>
                </div>
                <Status value={details.activeTrip.status} />
              </section>
            )}
            <div className="vehicle-detail-grid">
              <section className="vehicle-detail-card">
                <header>
                  <div>
                    <span>Driver usage</span>
                    <h4>Who drove this vehicle</h4>
                  </div>
                  <UsersRound />
                </header>
                {details.driverUsage.length ? (
                  details.driverUsage.map((item) => (
                    <div className="vehicle-driver-line" key={item.driver.id}>
                      <span className="driver-initial">
                        {item.driver.name
                          .split(" ")
                          .map((x) => x[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <div>
                        <b>{item.driver.name}</b>
                        <small>
                          {item.driver.licenseCategory} · {item.tripCount} trips
                          · last used {date(item.lastUsedAt)}
                        </small>
                      </div>
                      <strong>
                        {item.totalDistanceKm.toLocaleString("en-IN")} km
                      </strong>
                    </div>
                  ))
                ) : (
                  <Empty text="No driver usage recorded" />
                )}
              </section>
              <section className="vehicle-detail-card">
                <header>
                  <div>
                    <span>Cost snapshot</span>
                    <h4>Fuel and other expenses</h4>
                  </div>
                  <CircleDollarSign />
                </header>
                <div className="vehicle-cost-row">
                  <span>Fuel</span>
                  <b>{details.summary.fuelLiters.toLocaleString("en-IN")} L</b>
                  <strong>{money(details.summary.fuelCost)}</strong>
                </div>
                <div className="vehicle-cost-row">
                  <span>Maintenance</span>
                  <b>{details.maintenance.length} records</b>
                  <strong>{money(details.summary.maintenanceCost)}</strong>
                </div>
                <div className="vehicle-cost-row">
                  <span>Other expenses</span>
                  <b>{details.expenses.length} records</b>
                  <strong>{money(details.summary.otherExpenses)}</strong>
                </div>
              </section>
            </div>
            <section className="vehicle-history">
              <header>
                <div>
                  <span>Trip & odometer history</span>
                  <h4>{details.summary.totalTrips} recorded trips</h4>
                </div>
                <Route />
              </header>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Trip / date</th>
                      <th>Driver</th>
                      <th>Route</th>
                      <th>Odometer</th>
                      <th>Distance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.trips.map((trip) => (
                      <tr key={trip.id}>
                        <td>
                          <b>{trip.tripNo}</b>
                          <small>{date(trip.createdAt)}</small>
                        </td>
                        <td>
                          <b>{trip.driver.name}</b>
                          <small>{trip.driver.licenseCategory}</small>
                        </td>
                        <td>
                          {trip.source} <span className="route-arrow">→</span>{" "}
                          {trip.destination}
                        </td>
                        <td>
                          {trip.startOdometerKm != null ||
                          trip.finalOdometerKm != null ? (
                            <>
                              {trip.startOdometerKm?.toLocaleString("en-IN") ||
                                "—"}{" "}
                              →{" "}
                              {trip.finalOdometerKm?.toLocaleString("en-IN") ||
                                "—"}{" "}
                              km
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {trip.plannedDistanceKm.toLocaleString("en-IN")} km
                        </td>
                        <td>
                          <Status value={trip.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!details.trips.length && (
                  <Empty text="No trip history recorded" />
                )}
              </div>
            </section>
            <div className="vehicle-detail-grid">
              <section className="vehicle-detail-card">
                <header>
                  <div>
                    <span>Service history</span>
                    <h4>Maintenance & repairs</h4>
                  </div>
                  <Wrench />
                </header>
                {details.maintenance.length ? (
                  details.maintenance.map((item) => (
                    <div className="vehicle-record-line" key={item.id}>
                      <div>
                        <b>{item.serviceType}</b>
                        <small>
                          {date(item.startDate)}
                          {item.driver?.name
                            ? ` · reported by ${item.driver.name}`
                            : ""}
                          {item.reportedOdometerKm != null
                            ? ` · ${item.reportedOdometerKm.toLocaleString("en-IN")} km`
                            : ""}
                        </small>
                        <p>{item.description || "No service notes"}</p>
                      </div>
                      <span>
                        <strong>{money(item.cost)}</strong>
                        <Status value={item.status} />
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty text="No maintenance recorded" />
                )}
              </section>
              <section className="vehicle-detail-card">
                <header>
                  <div>
                    <span>Odometer evidence</span>
                    <h4>Fuel readings</h4>
                  </div>
                  <Fuel />
                </header>
                {details.fuelLogs.length ? (
                  details.fuelLogs.map((item) => (
                    <div className="vehicle-record-line" key={item.id}>
                      <div>
                        <b>{item.liters.toLocaleString("en-IN")} L fuel</b>
                        <small>
                          {date(item.date)}
                          {item.driver?.name ? ` · ${item.driver.name}` : ""}
                          {item.fuelStation ? ` · ${item.fuelStation}` : ""}
                        </small>
                        <p>
                          {item.odometerKm != null
                            ? `${item.odometerKm.toLocaleString("en-IN")} km reading`
                            : "Odometer not recorded"}
                        </p>
                      </div>
                      <strong>{money(item.cost)}</strong>
                    </div>
                  ))
                ) : (
                  <Empty text="No fuel readings recorded" />
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function VehicleForm({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<Vehicle>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(value.id ? `/vehicles/${value.id}` : "/vehicles", {
        method: value.id ? "PUT" : "POST",
        body: JSON.stringify(f),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={value.id ? "Edit vehicle" : "Register a vehicle"}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={save}>
        {error && (
          <div className="alert">
            <X />
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Registration number">
            <input
              name="registrationNo"
              defaultValue={value.registrationNo}
              required
            />
          </Field>
          <Field label="Vehicle name / model">
            <input name="name" defaultValue={value.name} required />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={value.type || "Van"}>
              <option>Van</option>
              <option>Truck</option>
              <option>Mini Truck</option>
              <option>Bus</option>
            </select>
          </Field>
          <Field label="Required licence">
            <select
              name="requiredLicenseCategory"
              defaultValue={value.requiredLicenseCategory || "LMV"}
            >
              <option>LMV</option>
              <option>HMV</option>
              <option>MCWG</option>
            </select>
          </Field>
          <Field label="Region">
            <select name="region" defaultValue={value.region || "West"}>
              <option>West</option>
              <option>North</option>
              <option>South</option>
              <option>East</option>
              <option>Central</option>
            </select>
          </Field>
          <Field label="Maximum capacity (kg)">
            <input
              name="capacityKg"
              type="number"
              min="1"
              defaultValue={value.capacityKg || 500}
              required
            />
          </Field>
          <Field label="Odometer (km)">
            <input
              name="odometerKm"
              type="number"
              min="0"
              defaultValue={value.odometerKm || 0}
              required
            />
          </Field>
          <Field label="Acquisition cost (₹)">
            <input
              name="acquisitionCost"
              type="number"
              min="0"
              defaultValue={value.acquisitionCost || 0}
              required
            />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={value.status || "AVAILABLE"}>
              {["AVAILABLE", "ON_TRIP", "IN_SHOP", "RETIRED"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            {value.id ? "Save changes" : "Register vehicle"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type DriverPerformance = {
  driverId: string;
  name: string;
  email?: string | null;
  onboardingStatus: string;
  status: string;
  payType: "PER_TRIP" | "HOURLY";
  payRate: number;
  tripCount: number;
  completedTrips: number;
  activeTrips: number;
  distanceKm: number;
  revenue: number;
  driverCost: number;
  documentsUpdated: number;
  documentsRequired: number;
  lastDocumentAt?: string | null;
  lastTripAt?: string | null;
};
type DriverDetail = Driver & {
  createdAt: string;
  verifiedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  user?: {
    email: string;
    isActive: boolean;
    lastActiveAt?: string | null;
    createdAt: string;
  } | null;
  documents: Array<{
    id: string;
    type: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
    url?: string | null;
  }>;
  trips: Array<{
    id: string;
    tripNo: string;
    source: string;
    destination: string;
    status: string;
    plannedDistanceKm: number;
    revenue: number;
    createdAt: string;
    completedAt?: string | null;
    vehicle: { name: string; registrationNo: string };
  }>;
};
function Drivers({
  user,
  globalSearch,
  selectedId,
  onSelectedHandled,
}: {
  user: User;
  globalSearch: string;
  selectedId: string | null;
  onSelectedHandled: () => void;
}) {
  const [rows, setRows] = useState<Driver[]>([]),
    [performance, setPerformance] = useState<DriverPerformance[]>([]),
    [search, setSearch] = useState(globalSearch),
    [edit, setEdit] = useState<Driver | Partial<Driver> | null>(null),
    [review, setReview] = useState<Driver | null>(null),
    [details, setDetails] = useState<Driver | null>(null);
  const can = ["OWNER", "ADMIN", "FLEET_MANAGER", "SAFETY_OFFICER"].includes(
    user.role,
  );
  const canDelete = ["OWNER", "ADMIN", "FLEET_MANAGER"].includes(user.role);
  const load = useCallback(
    () =>
      Promise.all([
        api<Driver[]>(`/drivers?q=${encodeURIComponent(search)}`),
        api<DriverPerformance[]>("/drivers/performance").catch(() => []),
      ]).then(([drivers, driverPerformance]) => {
        setRows(drivers);
        setPerformance(driverPerformance);
      }),
    [search],
  );
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setSearch(globalSearch), [globalSearch]);
  useEffect(() => {
    if (!selectedId) return;
    const match = rows.find((row) => row.id === selectedId);
    if (match) {
      setDetails(match);
      onSelectedHandled();
    }
  }, [selectedId, rows, onSelectedHandled]);
  async function remove(d: Driver) {
    if (confirm(`Delete ${d.name}?`)) {
      await api(`/drivers/${d.id}`, { method: "DELETE" });
      load();
    }
  }
  const perfByDriver = new Map(performance.map((row) => [row.driverId, row])),
    totals = performance.reduce(
      (sum, row) => ({
        revenue: sum.revenue + row.revenue,
        driverCost: sum.driverCost + row.driverCost,
        trips: sum.trips + row.tripCount,
      }),
      { revenue: 0, driverCost: 0, trips: 0 },
    );
  const netAfterDriver = totals.revenue - totals.driverCost;
  return (
    <>
      <PageTitle
        eyebrow="People & safety"
        title="Driver profiles"
        description="Driver records, mobile onboarding, payout cost and expense sync in one operations view"
        action={
          can ? (
            <Button onClick={() => setEdit({})}>
              <Plus size={17} /> Add driver
            </Button>
          ) : undefined
        }
      />
      <div className="driver-report-strip">
        <div>
          <span>Total trip revenue</span>
          <b>{money(totals.revenue)}</b>
          <small>{totals.trips} assigned trips</small>
        </div>
        <div>
          <span>Driver payout cost</span>
          <b>{money(totals.driverCost)}</b>
          <small>Auto-added to expenses on trip completion</small>
        </div>
        <div>
          <span>Net after driver payout</span>
          <b className={netAfterDriver < 0 ? "expired" : ""}>
            {money(netAfterDriver)}
          </b>
          <small>
            {totals.revenue
              ? Math.round((netAfterDriver / totals.revenue) * 100)
              : 0}
            % after payout
          </small>
        </div>
      </div>
      <Toolbar search={search} setSearch={setSearch} />
      <section className="panel records">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>License</th>
                <th>Category</th>
                <th>Expires</th>
                <th>Safety score</th>
                <th>Trips</th>
                <th>Pay / Cost</th>
                <th>Status</th>
                {can && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const perf = perfByDriver.get(d.id);
                return (
                  <tr key={d.id}>
                    <td>
                      <button
                        type="button"
                        className="driver-profile-link entity"
                        onClick={() => setDetails(d)}
                        aria-label={`Open ${d.name} details`}
                      >
                        <span className="person">
                          <UserRound />
                        </span>
                        <span>
                          <b>{d.name}</b>
                          <small>{d.contact}</small>
                        </span>
                        <ExternalLink />
                      </button>
                    </td>
                    <td>
                      <code>
                        {d.licenseNo.startsWith("PENDING-")
                          ? "Pending"
                          : d.licenseNo}
                      </code>
                    </td>
                    <td>{d.licenseCategory}</td>
                    <td
                      className={
                        new Date(d.licenseExpiry) < new Date() ? "expired" : ""
                      }
                    >
                      {d.licenseNo.startsWith("PENDING-")
                        ? "Not submitted"
                        : date(d.licenseExpiry)}
                    </td>
                    <td>
                      <div className="score">
                        <b>{d.safetyScore}</b>
                        <span>
                          <i style={{ width: `${d.safetyScore}%` }} />
                        </span>
                      </div>
                    </td>
                    <td>
                      <b>{perf?.tripCount || 0}</b>
                      <small>{perf?.completedTrips || 0} completed</small>
                    </td>
                    <td>
                      <b>{money(perf?.driverCost || 0)}</b>
                      <small>
                        {(perf?.payType || d.payType) === "HOURLY"
                          ? "Hourly"
                          : "Per trip"}{" "}
                        · {money(perf?.payRate || d.payRate || 0)}
                      </small>
                    </td>
                    <td>
                      <Status
                        value={
                          d.onboardingStatus &&
                          d.onboardingStatus !== "VERIFIED"
                            ? d.onboardingStatus
                            : d.status
                        }
                      />
                    </td>
                    {can && (
                      <td className="actions">
                        {d.userId && (
                          <button onClick={() => setReview(d)}>Review</button>
                        )}
                        <button onClick={() => setEdit(d)}>Edit</button>
                        {canDelete && (
                          <button onClick={() => remove(d)}>Delete</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <Empty />}
        </div>
      </section>
      <section className="panel driver-profit-panel">
        <div className="panel-head">
          <div>
            <span>Driver cost add-on</span>
            <h3>Payout & expense sync</h3>
          </div>
          <small>{performance.length} drivers tracked</small>
        </div>
        <div className="driver-profit-grid">
          {performance.map((row) => (
            <article key={row.driverId}>
              <div>
                <b>{row.name}</b>
                <small>{row.email || "Standalone driver profile"}</small>
              </div>
              <Status
                value={
                  row.onboardingStatus === "VERIFIED"
                    ? row.status
                    : row.onboardingStatus
                }
              />
              <div className="profit-facts">
                <span>
                  <small>Pay model</small>
                  <b>{row.payType === "HOURLY" ? "Hourly" : "Per trip"}</b>
                </span>
                <span>
                  <small>Rate</small>
                  <b>{money(row.payRate)}</b>
                </span>
                <span>
                  <small>Driver cost</small>
                  <b>{money(row.driverCost)}</b>
                </span>
                <span>
                  <small>Net after cost</small>
                  <b
                    className={
                      row.revenue - row.driverCost < 0 ? "expired" : ""
                    }
                  >
                    {money(row.revenue - row.driverCost)}
                  </b>
                </span>
              </div>
              <div className="driver-audit-row">
                <span>
                  <Route /> {row.tripCount} trips ·{" "}
                  {row.distanceKm.toLocaleString("en-IN")} km
                </span>
                <span>
                  <FileText /> {row.documentsUpdated}/{row.documentsRequired}{" "}
                  docs
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
      {edit && (
        <DriverForm
          value={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {details && (
        <DriverDetails
          driver={details}
          performance={perfByDriver.get(details.id)}
          onClose={() => setDetails(null)}
          onReview={
            details.userId
              ? () => {
                  setDetails(null);
                  setReview(details);
                }
              : undefined
          }
        />
      )}{" "}
      {review && (
        <DriverOnboardingReview
          driver={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            load();
          }}
        />
      )}
    </>
  );
}
function DriverDetails({
  driver,
  performance,
  onClose,
  onReview,
}: {
  driver: Driver;
  performance?: DriverPerformance;
  onClose: () => void;
  onReview?: () => void;
}) {
  const [details, setDetails] = useState<DriverDetail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<DriverDetail>(`/drivers/${driver.id}/details`)
      .then((result) => {
        if (active) setDetails(result);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [driver.id]);
  const documentLabel: Record<string, string> = {
    PROFILE_PHOTO: "Profile photo",
    LICENSE_FRONT: "Licence front",
    LICENSE_BACK: "Licence back",
  };
  const fileSize = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return (
    <Modal title={`${driver.name} · Driver profile`} onClose={onClose} wide>
      {error && (
        <div className="alert driver-detail-alert">
          <X />
          {error}
        </div>
      )}
      {!details && !error ? (
        <Loading />
      ) : (
        details && (
          <div className="driver-detail">
            <section className="driver-detail-hero">
              <span className="driver-detail-avatar">
                <UserRound />
              </span>
              <div>
                <span>Driver record</span>
                <h3>{details.name}</h3>
                <p>
                  {details.user?.email || "Standalone driver profile"} ·{" "}
                  {details.contact}
                </p>
              </div>
              <div className="driver-detail-status">
                <Status
                  value={
                    details.onboardingStatus &&
                    details.onboardingStatus !== "VERIFIED"
                      ? details.onboardingStatus
                      : details.status
                  }
                />
                <small>Added {date(details.createdAt)}</small>
              </div>
            </section>
            <div className="driver-detail-kpis">
              <div>
                <Gauge />
                <span>
                  <small>Safety score</small>
                  <b>{details.safetyScore}/100</b>
                </span>
              </div>
              <div>
                <Route />
                <span>
                  <small>Trips completed</small>
                  <b>{performance?.completedTrips || 0}</b>
                </span>
              </div>
              <div>
                <CircleDollarSign />
                <span>
                  <small>Driver cost</small>
                  <b>{money(performance?.driverCost || 0)}</b>
                </span>
              </div>
              <div>
                <FileText />
                <span>
                  <small>Documents</small>
                  <b>{details.documents.length}</b>
                </span>
              </div>
            </div>
            <div className="driver-detail-columns">
              <section className="driver-detail-section">
                <header>
                  <div>
                    <span>Identity & compliance</span>
                    <h4>Driver details</h4>
                  </div>
                  <ShieldCheck />
                </header>
                <dl className="driver-detail-list">
                  <div>
                    <dt>Licence number</dt>
                    <dd>
                      {details.licenseNo.startsWith("PENDING-")
                        ? "Not submitted"
                        : details.licenseNo}
                    </dd>
                  </div>
                  <div>
                    <dt>Licence category</dt>
                    <dd>{details.licenseCategory}</dd>
                  </div>
                  <div>
                    <dt>Licence expiry</dt>
                    <dd
                      className={
                        new Date(details.licenseExpiry) < new Date()
                          ? "expired"
                          : ""
                      }
                    >
                      {details.licenseNo.startsWith("PENDING-")
                        ? "Not submitted"
                        : date(details.licenseExpiry)}
                    </dd>
                  </div>
                  <div>
                    <dt>Pay model</dt>
                    <dd>
                      {details.payType === "HOURLY" ? "Hourly" : "Per trip"} ·{" "}
                      {money(details.payRate || 0)}
                    </dd>
                  </div>
                  <div>
                    <dt>Account</dt>
                    <dd>
                      {details.user
                        ? details.user.isActive
                          ? "Active"
                          : "Suspended"
                        : "Not linked"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd>
                      {details.user?.lastActiveAt
                        ? dateTime(details.user.lastActiveAt)
                        : "No activity yet"}
                    </dd>
                  </div>
                </dl>
                {details.reviewNote && (
                  <div className="review-note">
                    <AlertTriangle />
                    <span>
                      <b>Review note</b>
                      {details.reviewNote}
                    </span>
                  </div>
                )}
              </section>
              <section className="driver-detail-section">
                <header>
                  <div>
                    <span>Private files</span>
                    <h4>Uploaded documents</h4>
                  </div>
                  <FileText />
                </header>
                <div className="driver-document-list">
                  {details.documents.map((document) => {
                    const content = (
                      <>
                        <span className="driver-document-icon">
                          {document.type === "PROFILE_PHOTO" ? (
                            <Camera />
                          ) : (
                            <FileText />
                          )}
                        </span>
                        <span>
                          <b>
                            {documentLabel[document.type] ||
                              pretty(document.type)}
                          </b>
                          <small>{document.originalName}</small>
                          <em>
                            {fileSize(document.size)} ·{" "}
                            {dateTime(document.createdAt)}
                          </em>
                        </span>
                        {document.url ? <ExternalLink /> : <LockKeyhole />}
                      </>
                    );
                    return document.url ? (
                      <a
                        key={document.id}
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {content}
                      </a>
                    ) : (
                      <div
                        key={document.id}
                        title="Private file storage is not configured"
                      >
                        {content}
                      </div>
                    );
                  })}
                  {!details.documents.length && (
                    <div className="driver-documents-empty">
                      <FileText />
                      <span>
                        <b>No documents uploaded</b>Documents submitted from
                        driver onboarding will appear here.
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <section className="driver-detail-section driver-trip-history">
              <header>
                <div>
                  <span>Operations history</span>
                  <h4>Recent trips</h4>
                </div>
                <small>
                  {performance?.tripCount || details.trips.length} total
                </small>
              </header>
              {details.trips.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Trip</th>
                        <th>Route</th>
                        <th>Vehicle</th>
                        <th>Distance</th>
                        <th>Revenue</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.trips.map((trip) => (
                        <tr key={trip.id}>
                          <td>
                            <b>{trip.tripNo}</b>
                            <small>{date(trip.createdAt)}</small>
                          </td>
                          <td>
                            {trip.source} <span className="route-arrow">→</span>{" "}
                            {trip.destination}
                          </td>
                          <td>
                            <b>{trip.vehicle.name}</b>
                            <small>{trip.vehicle.registrationNo}</small>
                          </td>
                          <td>
                            {trip.plannedDistanceKm.toLocaleString("en-IN")} km
                          </td>
                          <td>{money(trip.revenue)}</td>
                          <td>
                            <Status value={trip.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="No trips assigned to this driver yet." />
              )}
            </section>
            <div className="driver-detail-actions">
              <span>
                <ShieldCheck /> Documents are private and links expire
                automatically.
              </span>
              {onReview && (
                <Button type="button" onClick={onReview}>
                  <FileText /> Review documents
                </Button>
              )}
            </div>
          </div>
        )
      )}
    </Modal>
  );
}
type DriverReview = {
  id: string;
  name: string;
  email?: string | null;
  contact: string;
  licenseNo: string;
  licenseCategory: string;
  licenseExpiry?: string | null;
  onboardingStatus: string;
  reviewNote?: string | null;
  documents: Array<{
    id: string;
    type: string;
    originalName: string;
    url?: string | null;
  }>;
};
function DriverOnboardingReview({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [profile, setProfile] = useState<DriverReview | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  useEffect(() => {
    api<DriverReview>(`/drivers/${driver.id}/onboarding`)
      .then(setProfile)
      .catch((e) => setError((e as Error).message));
  }, [driver.id]);
  async function decide(action: "approve" | "reject") {
    if (action === "reject" && note.trim().length < 3) {
      setError("Add a short note explaining what the driver needs to correct.");
      return;
    }
    try {
      await api(`/drivers/${driver.id}/onboarding/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "reject" ? { reviewNote: note } : {}),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Review driver onboarding" onClose={onClose}>
      {error && (
        <div className="alert">
          <X />
          {error}
        </div>
      )}
      {!profile ? (
        <Loading />
      ) : (
        <div className="driver-review">
          <div className="owner-note">
            <ShieldCheck />
            <span>
              <b>{profile.name}</b>
              {profile.email} · {profile.contact}
            </span>
          </div>
          <div className="profile-form-fields">
            <Field label="Licence number">
              <input value={profile.licenseNo} readOnly />
            </Field>
            <Field label="Licence category">
              <input value={profile.licenseCategory} readOnly />
            </Field>
            <Field label="Licence expiry">
              <input
                value={profile.licenseExpiry?.slice(0, 10) || ""}
                readOnly
              />
            </Field>
            <Field label="Submission status">
              <input value={profile.onboardingStatus} readOnly />
            </Field>
          </div>
          <div className="review-documents">
            {profile.documents.map((document) => (
              <a
                key={document.id}
                href={document.url || undefined}
                target="_blank"
                rel="noreferrer"
              >
                <FileText />
                <span>
                  <b>{document.type.replaceAll("_", " ")}</b>
                  <small>{document.originalName}</small>
                </span>
                <ExternalLink />
              </a>
            ))}
          </div>
          {profile.onboardingStatus === "NEEDS_REVIEW" && (
            <>
              <Field label="Correction note (required only when returning)">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Tell the driver exactly what needs to be corrected"
                />
              </Field>
              <div className="modal-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => decide("reject")}
                >
                  Return for correction
                </Button>
                <Button type="button" onClick={() => decide("approve")}>
                  <Check /> Approve driver
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
function DriverForm({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<Driver>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(value.id ? `/drivers/${value.id}` : "/drivers", {
        method: value.id ? "PUT" : "POST",
        body: JSON.stringify(f),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={value.id ? "Edit driver" : "Create driver profile"}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={save}>
        {error && (
          <div className="alert">
            <X />
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Full name">
            <input name="name" defaultValue={value.name} required />
          </Field>
          <Field label="Contact number">
            <input name="contact" defaultValue={value.contact} required />
          </Field>
          <Field label="License number">
            <input name="licenseNo" defaultValue={value.licenseNo} required />
          </Field>
          <Field label="License category">
            <select
              name="licenseCategory"
              defaultValue={value.licenseCategory || "LMV"}
            >
              <option>LMV</option>
              <option>HMV</option>
              <option>MCWG</option>
            </select>
          </Field>
          <Field label="License expiry">
            <input
              name="licenseExpiry"
              type="date"
              defaultValue={value.licenseExpiry?.slice(0, 10)}
              required
            />
          </Field>
          <Field label="Driver pay type">
            <select name="payType" defaultValue={value.payType || "PER_TRIP"}>
              <option value="PER_TRIP">Per trip</option>
              <option value="HOURLY">Hourly</option>
            </select>
          </Field>
          <Field label="Driver pay rate (₹)">
            <input
              name="payRate"
              type="number"
              min="0"
              step="1"
              defaultValue={value.payRate || 0}
              required
            />
          </Field>
          <Field label="Safety score">
            <input
              name="safetyScore"
              type="number"
              min="0"
              max="100"
              defaultValue={value.safetyScore || 100}
              required
            />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={value.status || "AVAILABLE"}>
              {["AVAILABLE", "ON_TRIP", "OFF_DUTY", "SUSPENDED"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="rule-note">
          <CircleDollarSign />
          <span>
            Driver payout is synced into Fuel & expenses automatically when a
            trip is completed.
          </span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save profile</Button>
        </div>
      </form>
    </Modal>
  );
}

function Trips({
  openCreate = false,
  onOpenCreateHandled,
  selectedId,
  onSelectedHandled,
}: {
  openCreate?: boolean;
  onOpenCreateHandled?: () => void;
  selectedId: string | null;
  onSelectedHandled: () => void;
}) {
  const [rows, setRows] = useState<Trip[]>([]),
    [open, setOpen] = useState(false),
    [complete, setComplete] = useState<Trip | null>(null),
    [dispatching, setDispatching] = useState<Trip | null>(null),
    [detailId, setDetailId] = useState<string | null>(null),
    [tracking, setTracking] = useState<Trip | null>(null),
    [failure, setFailure] = useState<{
      title: string;
      reasons: AssignmentFailureReason[];
    } | null>(null);
  const load = useCallback(() => api<Trip[]>("/trips").then(setRows), []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!openCreate) return;
    setOpen(true);
    if (onOpenCreateHandled) onOpenCreateHandled();
  }, [openCreate]);
  useEffect(() => {
    if (selectedId && rows.some((row) => row.id === selectedId)) {
      setDetailId(selectedId);
      onSelectedHandled();
    }
  }, [selectedId, rows, onSelectedHandled]);
  async function cancel(trip: Trip) {
    try {
      await api(`/trips/${trip.id}/cancel`, { method: "POST" });
      setFailure(null);
      load();
    } catch (error) {
      const apiError = error as ApiError;
      setFailure({
        title: `Unable to cancel ${trip.tripNo}`,
        reasons: [{ code: "REQUEST_FAILED", message: apiError.message }],
      });
    }
  }
  const isTrackable = (trip: Trip) =>
    trip.status === "DISPATCHED" || trip.status === "IN_PROGRESS";
  return (
    <>
      <PageTitle
        eyebrow="Dispatch center"
        title="Trip operations"
        description="Open any trip for its driver, timeline, evidence, live location and complete expense ledger"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} /> Create trip
          </Button>
        }
      />
      <div className="stage-strip">
        <div className="active">
          <i />
          <span>01</span>
          <b>Draft</b>
        </div>
        <em />
        <div>
          <i />
          <span>02</span>
          <b>On trip</b>
        </div>
        <em />
        <div>
          <i />
          <span>03</span>
          <b>Completed</b>
        </div>
      </div>
      <section className="panel records">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Trip</th>
                <th>Route</th>
                <th>Assignment</th>
                <th>Cargo</th>
                <th>Distance</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  className="clickable-row"
                  key={t.id}
                  tabIndex={0}
                  onClick={() => setDetailId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailId(t.id);
                    }
                  }}
                >
                  <td>
                    <b>{t.tripNo}</b>
                    <small>{date(t.createdAt)} · Open full details</small>
                  </td>
                  <td>
                    <div className="route-cell">
                      <span>{t.source}</span>
                      <i>→</i>
                      <span>{t.destination}</span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <b>{t.vehicle.name}</b>
                      <small>{t.driver.name}</small>
                    </div>
                  </td>
                  <td>{t.cargoWeightKg.toLocaleString()} kg</td>
                  <td>{t.plannedDistanceKm} km</td>
                  <td>
                    <Status value={t.status} />
                  </td>
                  <td
                    className="actions trip-row-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isTrackable(t) && (
                      <button
                        className="track-live-button"
                        onClick={() => setTracking(t)}
                      >
                        <MapPin /> Track live
                      </button>
                    )}
                    {t.status === "DRAFT" && (
                      <>
                        <button onClick={() => setDispatching(t)}>
                          Review & dispatch
                        </button>
                        <button onClick={() => cancel(t)}>Cancel</button>
                      </>
                    )}
                    {isTrackable(t) && (
                      <>
                        <button onClick={() => setComplete(t)}>Complete</button>
                        <button onClick={() => cancel(t)}>Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty />}
        </div>
      </section>
      {open && (
        <TripForm
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            load();
          }}
        />
      )}
      {dispatching && (
        <DispatchTrip
          trip={dispatching}
          onClose={() => setDispatching(null)}
          onSaved={() => {
            setDispatching(null);
            load();
          }}
        />
      )}
      {complete && (
        <CompleteTrip
          trip={complete}
          onClose={() => setComplete(null)}
          onSaved={() => {
            setComplete(null);
            load();
          }}
        />
      )}
      {detailId && (
        <TripDetailsModal tripId={detailId} onClose={() => setDetailId(null)} />
      )}{" "}
      {tracking && (
        <LiveTripTracking trip={tracking} onClose={() => setTracking(null)} />
      )}{" "}
      {failure && (
        <Modal title={failure.title} onClose={() => setFailure(null)}>
          <div className="failure-modal-body">
            <AssignmentFailurePanel
              title="Request failed"
              reasons={failure.reasons}
            />
            <div className="modal-actions">
              <Button onClick={() => setFailure(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function TrackingTrail({ points }: { points: TripLocationPoint[] }) {
  if (points.length < 2)
    return (
      <div className="tracking-trail-empty">
        The route trail will appear after the next GPS update.
      </div>
    );
  const latitudes = points.map((point) => point.latitude),
    longitudes = points.map((point) => point.longitude),
    minLat = Math.min(...latitudes),
    maxLat = Math.max(...latitudes),
    minLng = Math.min(...longitudes),
    maxLng = Math.max(...longitudes),
    latSpan = Math.max(maxLat - minLat, 0.0001),
    lngSpan = Math.max(maxLng - minLng, 0.0001);
  const path = points
    .map(
      (point) =>
        `${8 + ((point.longitude - minLng) / lngSpan) * 284},${112 - ((point.latitude - minLat) / latSpan) * 104}`,
    )
    .join(" ");
  return (
    <svg
      className="tracking-trail"
      viewBox="0 0 300 120"
      role="img"
      aria-label="Recent GPS movement trail"
    >
      <polyline points={path} />
      <circle
        cx={path.split(" ").at(-1)?.split(",")[0]}
        cy={path.split(" ").at(-1)?.split(",")[1]}
        r="5"
      />
    </svg>
  );
}

function LiveTripTracking({
  trip,
  onClose,
}: {
  trip: Trip;
  onClose: () => void;
}) {
  const [data, setData] = useState<TripTracking | null>(null),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false);
  const load = useCallback(
    () =>
      api<TripTracking>(trackingPath(trip.id))
        .then((value) => {
          setData(value);
          setError("");
        })
        .catch((reason) => setError((reason as Error).message)),
    [trip.id],
  );
  useEffect(() => {
    load();
    const polling = window.setInterval(load, 10000);
    const stream = new EventSource(trackingStreamUrl(API_URL, trip.id), {
      withCredentials: true,
    });
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data) as
          TrackingSnapshotEvent | LocationUpdateEvent;
        if (
          update.type === "TRACKING_SNAPSHOT" ||
          update.type === "LOCATION_UPDATE"
        )
          setData((current) => applyTrackingEvent(current, update));
      } catch {}
    };
    return () => {
      window.clearInterval(polling);
      stream.close();
    };
  }, [load, trip.id]);
  const latest = data?.latestLocation,
    ageSeconds = latest
      ? Math.max(
          0,
          Math.round(
            (Date.now() - new Date(latest.capturedAt).getTime()) / 1000,
          ),
        )
      : null,
    mapUrl = latest
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${latest.longitude - 0.015}%2C${latest.latitude - 0.01}%2C${latest.longitude + 0.015}%2C${latest.latitude + 0.01}&layer=mapnik&marker=${latest.latitude}%2C${latest.longitude}`
      : "";
  return (
    <Modal title={`${trip.tripNo} · Live tracking`} onClose={onClose} wide>
      <div className="live-tracking">
        {error && (
          <div className="alert">
            <WifiOff />
            <span>
              <b>Tracking connection unavailable</b>
              {error}
            </span>
          </div>
        )}
        {data?.trustWarning && (
          <div className="alert">
            <AlertTriangle />
            <span>
              <b>GPS integrity notice</b>
              {data.trustWarning}. The measured position is still shown so
              dispatch can verify it.
            </span>
          </div>
        )}
        <section className="tracking-head">
          <div>
            <span
              className={`tracking-pulse ${data?.trackingStatus === "LIVE" ? "live" : ""}`}
            >
              <Radio />
            </span>
            <div>
              <small>Driver location</small>
              <h3>{trip.driver.name}</h3>
              <p>
                {trip.vehicle.name} · {trip.vehicle.registrationNo}
              </p>
            </div>
          </div>
          <div className="tracking-connection">
            <i className={connected ? "connected" : ""} />
            <span>
              {connected
                ? "Realtime channel connected"
                : "Polling fallback active"}
            </span>
            <Status value={data?.trackingStatus || "CONNECTING"} />
          </div>
        </section>
        {!data && !error && (
          <div className="vehicle-detail-loading">
            <Activity /> Connecting to the trip location stream…
          </div>
        )}
        {data && !latest && (
          <section className="tracking-waiting">
            <MapPin />
            <div>
              <h3>Waiting for driver GPS</h3>
              <p>
                The trip is eligible for tracking. Location will appear after
                the driver grants permission and the mobile tracking service
                sends its first point.
              </p>
            </div>
          </section>
        )}
        {data && latest && (
          <>
            <div className="tracking-map">
              <iframe title={`Live location for ${trip.tripNo}`} src={mapUrl} />
              <div className="tracking-map-overlay">
                <span>
                  <MapPin /> Latest position
                </span>
                <b>
                  {latest.latitude.toFixed(6)}, {latest.longitude.toFixed(6)}
                </b>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${latest.latitude}&mlon=${latest.longitude}#map=16/${latest.latitude}/${latest.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open full map <ExternalLink />
                </a>
              </div>
            </div>
            <div className="tracking-metrics">
              <div>
                <Gauge />
                <span>
                  <small>Speed</small>
                  <b>
                    {latest.speedKph == null
                      ? "—"
                      : `${Math.round(latest.speedKph)} km/h`}
                  </b>
                </span>
              </div>
              <div>
                <Navigation />
                <span>
                  <small>GPS accuracy</small>
                  <b>±{Math.round(latest.accuracyM)} m</b>
                </span>
              </div>
              <div>
                <Activity />
                <span>
                  <small>Last update</small>
                  <b>
                    {ageSeconds != null && ageSeconds < 60
                      ? `${ageSeconds}s ago`
                      : dateTime(latest.capturedAt)}
                  </b>
                </span>
              </div>
              <div>
                <Zap />
                <span>
                  <small>Driver battery</small>
                  <b>
                    {latest.batteryPct == null ? "—" : `${latest.batteryPct}%`}
                  </b>
                </span>
              </div>
            </div>
            <div className="tracking-lower">
              <section>
                <header>
                  <div>
                    <small>Recent movement</small>
                    <h4>GPS trail · {data.history.length} points</h4>
                  </div>
                  <Route />
                </header>
                <TrackingTrail points={data.history} />
              </section>
              <section className="tracking-position-card">
                <span>Trip route</span>
                <h4>
                  {data.trip.source} → {data.trip.destination}
                </h4>
                <dl>
                  <div>
                    <dt>Captured</dt>
                    <dd>{dateTime(latest.capturedAt)}</dd>
                  </div>
                  <div>
                    <dt>Received</dt>
                    <dd>{dateTime(latest.receivedAt)}</dd>
                  </div>
                  <div>
                    <dt>Heading</dt>
                    <dd>
                      {latest.headingDeg == null
                        ? "—"
                        : `${Math.round(latest.headingDeg)}°`}
                    </dd>
                  </div>
                  <div>
                    <dt>Device integrity</dt>
                    <dd>
                      {latest.isMocked === true
                        ? "Mock-location warning"
                        : "No mock flag"}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </>
        )}
        <div className="tracking-privacy">
          <ShieldCheck />
          <span>
            <b>Trip-scoped location access</b>Only the assigned driver can
            publish points. Tracking is rejected after completion or
            cancellation and is visible only to authorized company operations
            roles.
          </span>
        </div>
      </div>
    </Modal>
  );
}

function TripDetailsModal({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [trip, setTrip] = useState<TripDetails | null>(null),
    [error, setError] = useState(""),
    [expense, setExpense] = useState<TripExpense | null>(null);
  useEffect(() => {
    let active = true;
    api<TripDetails>(`/trips/${tripId}`)
      .then((value) => {
        if (active) setTrip(value);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [tripId]);
  if (!trip)
    return (
      <Modal title="Trip details" onClose={onClose} wide>
        {error ? (
          <div className="modal-form">
            <div className="alert">
              <X />
              {error}
            </div>
          </div>
        ) : (
          <Loading />
        )}
      </Modal>
    );
  const summary = trip.financialSummary,
    events = [
      { label: "Created", time: trip.createdAt, done: true },
      {
        label: "Dispatched",
        time: trip.dispatchedAt,
        done: Boolean(trip.dispatchedAt),
      },
      {
        label: "Driver started",
        time: trip.startedAt,
        done: Boolean(trip.startedAt),
      },
      {
        label: "Completed",
        time: trip.completedAt,
        done: Boolean(trip.completedAt),
      },
    ];
  return (
    <>
      <Modal
        title={`${trip.tripNo} · Complete trip record`}
        onClose={onClose}
        wide
      >
        <div className="trip-detail-view">
          <section className="trip-detail-hero">
            <div className="trip-detail-route">
              <span>
                <Navigation />
              </span>
              <div>
                <small>Recorded route</small>
                <h3>
                  {trip.source} <i>→</i> {trip.destination}
                </h3>
                <p>
                  {trip.routeSummary ||
                    `${trip.plannedDistanceKm.toLocaleString("en-IN")} km planned journey`}
                </p>
              </div>
            </div>
            <Status value={trip.status} />
          </section>
          <div className="trip-financial-kpis">
            <div>
              <small>Trip revenue</small>
              <b>{money(summary.revenue)}</b>
              <span>Expected income</span>
            </div>
            <div>
              <small>Recorded spend</small>
              <b>{money(summary.actualCost)}</b>
              <span>Fuel + expenses + service</span>
            </div>
            <div className={summary.profit < 0 ? "negative" : "positive"}>
              <small>Actual margin</small>
              <b>{money(summary.profit)}</b>
              <span>
                {summary.marginPercent === null
                  ? "No revenue"
                  : `${summary.marginPercent.toFixed(1)}% margin`}
              </span>
            </div>
            <div>
              <small>Cost per km</small>
              <b>
                {summary.costPerKm === null ? "—" : money(summary.costPerKm)}
              </b>
              <span>
                {trip.plannedDistanceKm.toLocaleString("en-IN")} km route
              </span>
            </div>
          </div>
          <section className="trip-detail-timeline">
            {events.map((event, index) => (
              <div key={event.label} className={event.done ? "done" : ""}>
                <i />
                <span>
                  <b>{event.label}</b>
                  <small>{event.time ? dateTime(event.time) : "Pending"}</small>
                </span>
                {index < events.length - 1 && <em />}
              </div>
            ))}
          </section>
          <div className="trip-detail-columns">
            <section className="trip-detail-card">
              <header>
                <div>
                  <small>Assigned driver</small>
                  <h4>{trip.driver.name}</h4>
                </div>
                <UserRound />
              </header>
              <dl>
                <div>
                  <dt>Contact</dt>
                  <dd>{trip.driver.contact}</dd>
                </div>
                <div>
                  <dt>Work email</dt>
                  <dd>{trip.driver.user?.email || "Not linked"}</dd>
                </div>
                <div>
                  <dt>Licence</dt>
                  <dd>
                    {trip.driver.licenseNo} · {trip.driver.licenseCategory}
                  </dd>
                </div>
                <div>
                  <dt>Safety score</dt>
                  <dd>{trip.driver.safetyScore}/100</dd>
                </div>
                <div>
                  <dt>Payout recorded</dt>
                  <dd>{money(summary.driverPayout)}</dd>
                </div>
              </dl>
            </section>
            <section className="trip-detail-card">
              <header>
                <div>
                  <small>Assigned vehicle</small>
                  <h4>{trip.vehicle.name}</h4>
                </div>
                <Truck />
              </header>
              <dl>
                <div>
                  <dt>Registration</dt>
                  <dd>{trip.vehicle.registrationNo}</dd>
                </div>
                <div>
                  <dt>Type / region</dt>
                  <dd>
                    {trip.vehicle.type} · {trip.vehicle.region}
                  </dd>
                </div>
                <div>
                  <dt>Cargo carried</dt>
                  <dd>{trip.cargoWeightKg.toLocaleString("en-IN")} kg</dd>
                </div>
                <div>
                  <dt>Odometer</dt>
                  <dd>
                    {trip.startOdometerKm != null
                      ? `${trip.startOdometerKm.toLocaleString()} → `
                      : ""}
                    {trip.finalOdometerKm != null
                      ? `${trip.finalOdometerKm.toLocaleString()} km`
                      : "Pending"}
                  </dd>
                </div>
                <div>
                  <dt>Fuel consumed</dt>
                  <dd>
                    {trip.fuelConsumedL != null
                      ? `${trip.fuelConsumedL.toLocaleString()} L`
                      : "Not recorded"}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
          <section className="trip-ledger">
            <header>
              <div>
                <small>Itemized financial ledger</small>
                <h4>Trip expenses</h4>
                <p>
                  Click any expense to inspect who submitted it, when it
                  occurred and its receipt evidence.
                </p>
              </div>
              <b>{money(summary.expenseCost)}</b>
            </header>
            {trip.expenses.length ? (
              <div className="trip-ledger-list">
                {trip.expenses.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setExpense(item)}
                  >
                    <span className="ledger-icon">
                      <CircleDollarSign />
                    </span>
                    <span>
                      <b>{pretty(item.type)}</b>
                      <small>
                        {item.vendor || item.description || "No description"} ·{" "}
                        {dateTime(item.date)}
                      </small>
                      <em>
                        {item.submittedByDriver?.name ||
                          (item.source === "FASTAG"
                            ? "Automatic FASTag"
                            : "Company entry")}{" "}
                        · {pretty(item.source)}
                      </em>
                    </span>
                    {item.receiptUrl && <FileText />}
                    <strong>{money(item.amount)}</strong>
                    <ExternalLink />
                  </button>
                ))}
              </div>
            ) : (
              <Empty text="No expenses are linked to this trip yet." />
            )}
          </section>
          {summary.unallocatedCandidateCount > 0 && (
            <div className="allocation-warning">
              <AlertTriangle />
              <span>
                <b>
                  {summary.unallocatedCandidateCount} vehicle transactions need
                  trip allocation
                </b>
                {money(summary.unallocatedCandidateCost)} of vehicle activity
                occurred during this trip window but is not included in actual
                trip cost until explicitly linked.
              </span>
            </div>
          )}
          <div className="trip-activity-grid">
            <section className="trip-ledger compact">
              <header>
                <div>
                  <small>Fuel activity</small>
                  <h4>Fuel records</h4>
                </div>
                <b>{money(summary.fuelCost)}</b>
              </header>
              {trip.fuelLogs.map((item) => (
                <div className="activity-row" key={item.id}>
                  <Fuel />
                  <span>
                    <b>
                      {item.liters.toLocaleString()} L ·{" "}
                      {item.fuelStation || "Fuel stop"}
                    </b>
                    <small>
                      {dateTime(item.date)} ·{" "}
                      {item.driver?.name || pretty(item.source)}
                    </small>
                  </span>
                  <strong>{money(item.cost)}</strong>
                </div>
              ))}
              {!trip.fuelLogs.length && (
                <Empty text="No fuel entries linked." />
              )}
            </section>
            <section className="trip-ledger compact">
              <header>
                <div>
                  <small>Service impact</small>
                  <h4>Maintenance</h4>
                </div>
                <b>{money(summary.maintenanceCost)}</b>
              </header>
              {trip.maintenance.map((item) => (
                <div className="activity-row" key={item.id}>
                  <Wrench />
                  <span>
                    <b>{item.serviceType}</b>
                    <small>
                      {dateTime(item.startDate)} ·{" "}
                      {item.driver?.name || pretty(item.source)}
                    </small>
                  </span>
                  <strong>{money(item.cost)}</strong>
                </div>
              ))}
              {!trip.maintenance.length && (
                <Empty text="No maintenance linked." />
              )}
            </section>
          </div>
          <section className="trip-ledger evidence-ledger">
            <header>
              <div>
                <small>Operational audit trail</small>
                <h4>Driver evidence & updates</h4>
              </div>
              <b>{trip.evidence.length}</b>
            </header>
            {trip.evidence.length ? (
              <div className="evidence-list">
                {trip.evidence.map((item) =>
                  item.url ? (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText />
                      <span>
                        <b>{pretty(item.type)}</b>
                        <small>
                          {item.driver.name} · {dateTime(item.createdAt)}
                        </small>
                        <em>
                          {item.note ||
                            item.originalName ||
                            "Uploaded evidence"}
                        </em>
                      </span>
                      <ExternalLink />
                    </a>
                  ) : (
                    <div key={item.id}>
                      <Activity />
                      <span>
                        <b>{pretty(item.type)}</b>
                        <small>
                          {item.driver.name} · {dateTime(item.createdAt)}
                        </small>
                        <em>{item.note || "Synchronized update"}</em>
                      </span>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <Empty text="No driver evidence submitted for this trip." />
            )}
          </section>
        </div>
      </Modal>
      {expense && (
        <ExpenseDetailsModal
          expense={expense}
          trip={trip}
          onClose={() => setExpense(null)}
        />
      )}
    </>
  );
}

function ExpenseDetailsModal({
  expense,
  trip,
  onClose,
}: {
  expense: TripExpense;
  trip: TripDetails;
  onClose: () => void;
}) {
  const submittedBy =
    expense.submittedByDriver?.name ||
    (expense.source === "FASTAG"
      ? "FASTag issuer synchronization"
      : "Company operations");
  return (
    <Modal title={`${pretty(expense.type)} expense`} onClose={onClose}>
      <div className="expense-detail">
        <section>
          <span>
            <CircleDollarSign />
          </span>
          <div>
            <small>Recorded amount</small>
            <h3>{money(expense.amount)}</h3>
            <p>
              {trip.tripNo} · {trip.source} → {trip.destination}
            </p>
          </div>
          <Status value={expense.source} />
        </section>
        <dl>
          <div>
            <dt>Expense category</dt>
            <dd>{pretty(expense.type)}</dd>
          </div>
          <div>
            <dt>Spent / recorded at</dt>
            <dd>{dateTime(expense.date)}</dd>
          </div>
          <div>
            <dt>Submitted by</dt>
            <dd>{submittedBy}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{pretty(expense.source)}</dd>
          </div>
          <div>
            <dt>Vendor / plaza</dt>
            <dd>
              {expense.vendor ||
                expense.fastagTransaction?.plazaName ||
                "Not provided"}
            </dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{expense.description || "No description provided"}</dd>
          </div>
          <div>
            <dt>Receipt verification</dt>
            <dd>
              {expense.ocrConfidence != null
                ? `${expense.ocrConfidence.toFixed(0)}% OCR confidence`
                : expense.receiptUrl
                  ? "Receipt attached"
                  : "No receipt attached"}
            </dd>
          </div>
          {expense.fastagTransaction && (
            <>
              <div>
                <dt>FASTag transaction</dt>
                <dd>{expense.fastagTransaction.providerTxnId}</dd>
              </div>
              <div>
                <dt>Settlement</dt>
                <dd>
                  {pretty(expense.fastagTransaction.status)}
                  {expense.fastagTransaction.lane
                    ? ` · ${expense.fastagTransaction.lane}`
                    : ""}
                </dd>
              </div>
            </>
          )}
        </dl>
        {expense.receiptUrl ? (
          <a
            className="expense-receipt"
            href={expense.receiptUrl}
            target="_blank"
            rel="noreferrer"
          >
            <FileText />
            <span>
              <b>Open receipt evidence</b>
              <small>
                {expense.receiptOriginalName || "Secure receipt image"} · link
                expires automatically
              </small>
            </span>
            <ExternalLink />
          </a>
        ) : (
          <div className="expense-no-receipt">
            <FileText />
            <span>
              <b>No receipt evidence</b>This entry was recorded without an
              uploaded receipt.
            </span>
          </div>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function TripForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [drivers, setDrivers] = useState<Driver[]>([]),
    [sourceText, setSourceText] = useState(""),
    [destinationText, setDestinationText] = useState(""),
    [sourcePlace, setSourcePlace] = useState<Place | null>(null),
    [destinationPlace, setDestinationPlace] = useState<Place | null>(null),
    [vehicleId, setVehicleId] = useState(""),
    [driverId, setDriverId] = useState(""),
    [cargoWeight, setCargoWeight] = useState(""),
    [revenue, setRevenue] = useState("0"),
    [routes, setRoutes] = useState<RouteOption[]>([]),
    [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null),
    [routeState, setRouteState] = useState<
      "idle" | "loading" | "ready" | "error"
    >("idle"),
    [estimate, setEstimate] = useState<TripProfitabilityEstimate | null>(null),
    [estimateState, setEstimateState] = useState<
      "idle" | "loading" | "ready" | "error"
    >("idle"),
    [serverReasons, setServerReasons] = useState<AssignmentFailureReason[]>([]);
  const routeRequest = useRef(0),
    estimateRequest = useRef(0);
  useEffect(() => {
    Promise.all([
      api<Vehicle[]>("/vehicles/available"),
      api<Driver[]>("/drivers/available"),
    ]).then(([v, d]) => {
      setVehicles(v);
      setDrivers(d);
    });
  }, []);
  useEffect(() => {
    const request = ++routeRequest.current;
    if (!sourcePlace || !destinationPlace || !vehicleId) {
      setRoutes([]);
      setSelectedRoute(null);
      setRouteState("idle");
      return;
    }
    setRouteState("loading");
    setRoutes([]);
    setSelectedRoute(null);
    api<RouteEstimateResponse>("/routes/estimate", {
      method: "POST",
      body: JSON.stringify({
        source: sourcePlace,
        destination: destinationPlace,
        vehicleId,
      }),
    })
      .then((result) => {
        if (request === routeRequest.current) {
          setRoutes(result.options);
          setSelectedRoute(
            result.options.find((option) => option.recommended) ||
              result.options[0] ||
              null,
          );
          setRouteState("ready");
        }
      })
      .catch(() => {
        if (request === routeRequest.current) {
          setRouteState("error");
          setRoutes([]);
          setSelectedRoute(null);
        }
      });
  }, [destinationPlace, sourcePlace, vehicleId]);
  useEffect(() => {
    const request = ++estimateRequest.current,
      expectedRevenue = Number(revenue);
    if (!selectedRoute || !vehicleId || expectedRevenue < 0) {
      setEstimate(null);
      setEstimateState("idle");
      return;
    }
    setEstimateState("loading");
    const timer = window.setTimeout(
      () =>
        api<TripProfitabilityEstimate>("/trips/profitability-estimate", {
          method: "POST",
          body: JSON.stringify({
            vehicleId,
            plannedDistanceKm: selectedRoute.distanceKm,
            revenue: expectedRevenue,
            estimatedTollsInr: selectedRoute.estimatedToll,
          }),
        })
          .then((result) => {
            if (request === estimateRequest.current) {
              setEstimate(result);
              setEstimateState("ready");
            }
          })
          .catch(() => {
            if (request === estimateRequest.current) {
              setEstimate(null);
              setEstimateState("error");
            }
          }),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [revenue, selectedRoute, vehicleId]);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId),
    selectedDriver = drivers.find((driver) => driver.id === driverId);
  const localReasons = useMemo<AssignmentFailureReason[]>(() => {
    const reasons: AssignmentFailureReason[] = [];
    const weight = Number(cargoWeight);
    if (selectedVehicle && weight > selectedVehicle.capacityKg) {
      const excessKg = weight - selectedVehicle.capacityKg;
      reasons.push({
        code: "CARGO_OVER_CAPACITY",
        field: "cargoWeightKg",
        message: `Cargo exceeds ${selectedVehicle.name}'s capacity by ${excessKg.toLocaleString("en-IN")} kg.`,
        details: {
          cargoWeightKg: weight,
          capacityKg: selectedVehicle.capacityKg,
          excessKg,
        },
      });
    }
    if (
      selectedVehicle &&
      selectedDriver &&
      selectedDriver.licenseCategory !== selectedVehicle.requiredLicenseCategory
    )
      reasons.push({
        code: "LICENSE_CATEGORY_MISMATCH",
        field: "driverId",
        message: `${selectedVehicle.name} requires a ${selectedVehicle.requiredLicenseCategory} licence; ${selectedDriver.name} holds ${selectedDriver.licenseCategory}.`,
        details: {
          requiredCategory: selectedVehicle.requiredLicenseCategory,
          driverCategory: selectedDriver.licenseCategory,
        },
      });
    return reasons;
  }, [cargoWeight, selectedDriver, selectedVehicle]);
  const reasons = serverReasons.length ? serverReasons : localReasons;
  const hasFieldError = (field: string) =>
    reasons.some((reason) => reason.field === field);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      localReasons.length ||
      !sourcePlace ||
      !destinationPlace ||
      !selectedRoute
    )
      return;
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const payload = {
      ...form,
      source: sourcePlace.label,
      destination: destinationPlace.label,
      plannedDistanceKm: selectedRoute.distanceKm,
      estimatedTollsInr: selectedRoute.estimatedToll,
      estimatedDurationMin: selectedRoute.durationMinutes,
      routeSummary: selectedRoute.via,
      routeProvider: selectedRoute.provider,
      tollEstimateStatus: selectedRoute.tollEstimateStatus,
      routeEstimatedAt: new Date().toISOString(),
    };
    try {
      await api("/trips", { method: "POST", body: JSON.stringify(payload) });
      onSaved();
    } catch (error) {
      const apiError = error as ApiError;
      setServerReasons(
        apiError instanceof ApiError && apiError.reasons.length
          ? (apiError.reasons as AssignmentFailureReason[])
          : [{ code: "REQUEST_FAILED", message: apiError.message }],
      );
    }
  }
  const canCreate =
    Boolean(sourcePlace && destinationPlace && selectedRoute) &&
    reasons.length === 0;
  return (
    <Modal title="Plan a new trip" onClose={onClose} wide>
      <form className="modal-form trip-planner" onSubmit={save}>
        <AssignmentFailurePanel reasons={reasons} />
        <div className="form-grid">
          <LocationAutocomplete
            label="Origin"
            text={sourceText}
            selected={sourcePlace}
            onText={(value) => {
              setSourceText(value);
              setSourcePlace(null);
            }}
            onSelect={(place) => {
              setSourcePlace(place);
              setSourceText(place.label);
            }}
          />
          <LocationAutocomplete
            label="Destination"
            text={destinationText}
            selected={destinationPlace}
            onText={(value) => {
              setDestinationText(value);
              setDestinationPlace(null);
            }}
            onSelect={(place) => {
              setDestinationPlace(place);
              setDestinationText(place.label);
            }}
          />
          <Field label="Available vehicle" error={hasFieldError("vehicleId")}>
            <select
              name="vehicleId"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setServerReasons([]);
              }}
              required
            >
              <option value="">Select vehicle</option>
              {vehicles.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name} · {v.type} · {v.capacityKg} kg
                </option>
              ))}
            </select>
          </Field>
          <Field label="Available driver" error={hasFieldError("driverId")}>
            <select
              name="driverId"
              value={driverId}
              onChange={(e) => {
                setDriverId(e.target.value);
                setServerReasons([]);
              }}
              required
            >
              <option value="">Select driver</option>
              {drivers.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name} · {d.licenseCategory} · expires{" "}
                  {date(d.licenseExpiry)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Cargo weight (kg)"
            error={hasFieldError("cargoWeightKg")}
          >
            <input
              name="cargoWeightKg"
              type="number"
              min="1"
              value={cargoWeight}
              onChange={(e) => {
                setCargoWeight(e.target.value);
                setServerReasons([]);
              }}
              required
            />
          </Field>
          <Field label="Expected revenue (₹)">
            <input
              name="revenue"
              type="number"
              min="0"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="route-state" aria-live="polite">
          {routeState === "idle" && (
            <span>
              Select suggested origin, destination and vehicle to calculate
              routes automatically.
            </span>
          )}
          {routeState === "loading" && (
            <span>Calculating route options, distance and provider tolls…</span>
          )}
          {routeState === "error" && (
            <span>
              <AlertTriangle /> Verified route options are temporarily
              unavailable. Try the locations again.
            </span>
          )}
          {routeState === "ready" && (
            <RouteOptions
              options={routes}
              selected={selectedRoute}
              onSelect={setSelectedRoute}
            />
          )}
        </div>
        <div className="estimate-state" aria-live="polite">
          {estimateState === "loading" && (
            <span>
              Recalculating profitability for{" "}
              {selectedRoute?.label.toLowerCase()}…
            </span>
          )}
          {estimateState === "error" && (
            <span>
              <AlertTriangle /> Profitability estimate is temporarily
              unavailable.
            </span>
          )}
          {estimateState === "ready" && estimate && (
            <ProfitabilityPanel estimate={estimate} />
          )}
        </div>
        <div className="rule-note">
          <ShieldCheck />
          <span>
            Route values are rough provider estimates. Capacity, availability
            and licence eligibility are checked again before creation and
            dispatch.
          </span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canCreate}>
            Create draft
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function DispatchTrip({
  trip,
  onClose,
  onSaved,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [estimate, setEstimate] = useState<TripProfitabilityEstimate | null>(
      null,
    ),
    [estimateState, setEstimateState] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [retry, setRetry] = useState(0),
    [submitting, setSubmitting] = useState(false),
    [reasons, setReasons] = useState<AssignmentFailureReason[]>([]);
  useEffect(() => {
    let active = true;
    setEstimateState("loading");
    api<TripProfitabilityEstimate>(`/trips/${trip.id}/profitability-estimate`)
      .then((result) => {
        if (active) {
          setEstimate(result);
          setEstimateState("ready");
        }
      })
      .catch(() => {
        if (active) {
          setEstimate(null);
          setEstimateState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [retry, trip.id]);
  async function dispatch() {
    setSubmitting(true);
    setReasons([]);
    try {
      await api(`/trips/${trip.id}/dispatch`, { method: "POST" });
      onSaved();
    } catch (error) {
      const apiError = error as ApiError;
      setReasons(
        apiError instanceof ApiError && apiError.reasons.length
          ? (apiError.reasons as AssignmentFailureReason[])
          : [{ code: "REQUEST_FAILED", message: apiError.message }],
      );
      setSubmitting(false);
    }
  }
  return (
    <Modal title={`Review ${trip.tripNo} before dispatch`} onClose={onClose}>
      <div className="dispatch-review">
        <div className="trip-route-brief">
          <Navigation />
          <div>
            <b>
              {trip.source} → {trip.destination}
            </b>
            <span>
              {trip.plannedDistanceKm.toLocaleString("en-IN")} km
              {trip.estimatedDurationMin
                ? ` · ${routeDuration(trip.estimatedDurationMin)}`
                : ""}
              {trip.routeSummary ? ` · ${trip.routeSummary}` : ""}
            </span>
            <small>
              {trip.estimatedTollsInr === null
                ? "Provider toll price unavailable"
                : `Estimated toll ${money(trip.estimatedTollsInr)}`}{" "}
              ·{" "}
              {trip.routeProvider ? pretty(trip.routeProvider) : "Stored route"}{" "}
              estimate
            </small>
          </div>
        </div>
        <AssignmentFailurePanel title="Unable to dispatch" reasons={reasons} />
        <div className="estimate-state" aria-live="polite">
          {estimateState === "loading" && (
            <span>Loading profitability estimate…</span>
          )}
          {estimateState === "error" && (
            <div className="estimate-error">
              <AlertTriangle />
              <span>
                <b>Profitability estimate unavailable.</b> This does not affect
                assignment eligibility, and you may still dispatch.
              </span>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {estimateState === "ready" && estimate && (
            <ProfitabilityPanel estimate={estimate} />
          )}
        </div>
        <div className="rule-note">
          <ShieldCheck />
          <span>
            Dispatch rechecks vehicle, driver, capacity and licence eligibility.
            Route and profitability values are advisory estimates.
          </span>
        </div>
        <div className="modal-actions">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={dispatch} disabled={submitting}>
            {submitting ? "Dispatching…" : "Confirm dispatch"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function CompleteTrip({
  trip,
  onClose,
  onSaved,
}: {
  trip: Trip;
  onClose: () => void;
  onSaved: () => void;
}) {
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api(`/trips/${trip.id}/complete`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  const hourly =
    trip.driver.payType === "HOURLY" && Boolean(trip.driver.payRate);
  return (
    <Modal title={`Complete ${trip.tripNo}`} onClose={onClose}>
      <form className="modal-form" onSubmit={save}>
        <p className="modal-copy">
          Enter the closing readings. Vehicle and driver will become available
          automatically.
        </p>
        <div className="form-grid">
          <Field label="Final odometer (km)">
            <input
              name="finalOdometerKm"
              type="number"
              min={trip.vehicle.odometerKm}
              defaultValue={trip.vehicle.odometerKm + trip.plannedDistanceKm}
              required
            />
          </Field>
          <Field label="Fuel consumed (liters)">
            <input
              name="fuelConsumedL"
              type="number"
              min="0.1"
              step="0.1"
              required
            />
          </Field>
          {hourly && (
            <Field label="Driver hours">
              <input
                name="driverHours"
                type="number"
                min="0.1"
                step="0.1"
                required
              />
            </Field>
          )}
        </div>
        <div className="rule-note">
          <CircleDollarSign />
          <span>
            {trip.driver.payRate
              ? `Driver payout will sync as an expense: ${trip.driver.payType === "HOURLY" ? "hourly rate" : "per-trip rate"} ${money(trip.driver.payRate)}.`
              : "No driver payout rate is configured for this driver."}
          </span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Complete trip</Button>
        </div>
      </form>
    </Modal>
  );
}

function MaintenancePage({
  initialDraft,
  onInitialDraftHandled,
}: {
  initialDraft: MaintenanceDraft | null;
  onInitialDraftHandled: () => void;
}) {
  const [rows, setRows] = useState<Maintenance[]>([]),
    [open, setOpen] = useState(Boolean(initialDraft)),
    [draft, setDraft] = useState<MaintenanceDraft | null>(initialDraft);
  const load = () => api<Maintenance[]>("/maintenance").then(setRows);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!initialDraft) return;
    setDraft(initialDraft);
    setOpen(true);
    onInitialDraftHandled();
  }, [initialDraft]);
  async function close(id: string) {
    await api(`/maintenance/${id}/close`, { method: "POST" });
    load();
  }
  return (
    <>
      <PageTitle
        eyebrow="Fleet health"
        title="Maintenance control"
        description="Service history, active workshop jobs and vehicle readiness"
        action={
          <Button
            onClick={() => {
              setDraft(null);
              setOpen(true);
            }}
          >
            <Plus size={17} /> Log service
          </Button>
        }
      />
      <div className="maintenance-summary">
        <div>
          <Wrench />
          <span>
            <b>{rows.filter((x) => x.status === "ACTIVE").length}</b>Active jobs
          </span>
        </div>
        <div>
          <Check />
          <span>
            <b>{rows.filter((x) => x.status === "CLOSED").length}</b>Completed
            services
          </span>
        </div>
        <div>
          <CircleDollarSign />
          <span>
            <b>{money(rows.reduce((s, x) => s + x.cost, 0))}</b>Total service
            cost
          </span>
        </div>
      </div>
      <section className="panel records">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Service</th>
                <th>Started</th>
                <th>Cost</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="entity">
                      <span>
                        <Wrench />
                      </span>
                      <div>
                        <b>{m.vehicle.name}</b>
                        <small>{m.vehicle.registrationNo}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <b>{m.serviceType}</b>
                    <small>{m.description}</small>
                  </td>
                  <td>{date(m.startDate)}</td>
                  <td>{money(m.cost)}</td>
                  <td>
                    <Status value={m.status} />
                  </td>
                  <td className="actions">
                    {m.status === "ACTIVE" && (
                      <button onClick={() => close(m.id)}>Close service</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {open && (
        <MaintenanceForm
          initialVehicleId={draft?.vehicleId}
          onClose={() => {
            setOpen(false);
            setDraft(null);
          }}
          onSaved={() => {
            setOpen(false);
            setDraft(null);
            load();
          }}
        />
      )}
    </>
  );
}
function MaintenanceForm({
  initialVehicleId,
  onClose,
  onSaved,
}: {
  initialVehicleId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<Vehicle[]>("/vehicles/available").then(setVehicles);
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api("/maintenance", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Create maintenance record" onClose={onClose}>
      <form className="modal-form" onSubmit={save}>
        {error && (
          <div className="alert">
            <X />
            {error}
          </div>
        )}
        <Field label="Available vehicle">
          <select
            name="vehicleId"
            defaultValue={initialVehicleId || ""}
            required
          >
            <option value="">Select vehicle</option>
            {vehicles.map((v) => (
              <option value={v.id} key={v.id}>
                {v.name} · {v.registrationNo}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Service type">
            <input name="serviceType" placeholder="Oil change" required />
          </Field>
          <Field label="Estimated cost (₹)">
            <input name="cost" type="number" min="0" required />
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" rows={3} />
        </Field>
        <div className="rule-note">
          <Wrench />
          <span>
            Saving this record immediately changes the vehicle status to In
            Shop.
          </span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Start service</Button>
        </div>
      </form>
    </Modal>
  );
}

function FinancePage({
  initialFuel,
  onInitialFuelHandled,
}: {
  initialFuel: FuelDraft | null;
  onInitialFuelHandled: () => void;
}) {
  const [data, setData] = useState<Finance>({ fuelLogs: [], expenses: [] }),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [modal, setModal] = useState<"fuel" | "expense" | null>(
      initialFuel ? "fuel" : null,
    ),
    [fuelDraft, setFuelDraft] = useState<FuelDraft | null>(initialFuel);
  const load = () =>
    Promise.all([api<Finance>("/finance"), api<Vehicle[]>("/vehicles")]).then(
      ([d, v]) => {
        setData(d);
        setVehicles(v);
      },
    );
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!initialFuel) return;
    setFuelDraft(initialFuel);
    setModal("fuel");
    onInitialFuelHandled();
  }, [initialFuel]);
  const total =
    data.fuelLogs.reduce((s, x) => s + x.cost, 0) +
    data.expenses.reduce((s, x) => s + x.amount, 0);
  return (
    <>
      <PageTitle
        eyebrow="Financial operations"
        title="Fuel & expenses"
        description="Capture every rupee spent across the fleet"
        action={
          <div className="button-row">
            <Button
              onClick={() => {
                setFuelDraft(null);
                setModal("fuel");
              }}
            >
              <Plus size={17} /> Fuel log
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setFuelDraft(null);
                setModal("expense");
              }}
            >
              <Plus size={17} /> Expense
            </Button>
          </div>
        }
      />
      <div className="finance-cards">
        <div>
          <span>Total operating spend</span>
          <b>{money(total)}</b>
          <small>Across recorded transactions</small>
        </div>
        <div>
          <span>Fuel cost</span>
          <b>{money(data.fuelLogs.reduce((s, x) => s + x.cost, 0))}</b>
          <small>
            {data.fuelLogs.reduce((s, x) => s + x.liters, 0)} liters logged
          </small>
        </div>
        <div>
          <span>Other expenses</span>
          <b>{money(data.expenses.reduce((s, x) => s + x.amount, 0))}</b>
          <small>{data.expenses.length} transactions</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel wide">
          <div className="panel-head">
            <div>
              <span>Fuel management</span>
              <h3>Recent fuel logs</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Date</th>
                  <th>Volume</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.fuelLogs.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.vehicle.name}</b>
                      <small>{x.vehicle.registrationNo}</small>
                    </td>
                    <td>{date(x.date)}</td>
                    <td>{x.liters} L</td>
                    <td>
                      <b>{money(x.cost)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span>Expenses</span>
              <h3>Other spend</h3>
            </div>
          </div>
          {data.expenses.map((x) => (
            <div className="expense-line" key={x.id}>
              <span>
                <CircleDollarSign />
              </span>
              <div>
                <b>{pretty(x.type)}</b>
                <small>
                  {x.vehicle.name} · {x.description}
                </small>
              </div>
              <strong>{money(x.amount)}</strong>
            </div>
          ))}
        </section>
      </div>
      {modal && (
        <FinanceForm
          type={modal}
          vehicles={vehicles}
          initialFuel={modal === "fuel" ? fuelDraft : null}
          onClose={() => {
            setModal(null);
            setFuelDraft(null);
          }}
          onSaved={() => {
            setModal(null);
            setFuelDraft(null);
            load();
          }}
        />
      )}
    </>
  );
}
function FinanceForm({
  type,
  vehicles,
  initialFuel,
  onClose,
  onSaved,
}: {
  type: "fuel" | "expense";
  vehicles: Vehicle[];
  initialFuel: FuelDraft | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await api(type === "fuel" ? "/fuel" : "/expenses", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  return (
    <Modal
      title={type === "fuel" ? "Add fuel log" : "Add fleet expense"}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={save}>
        <Field label="Vehicle">
          <select
            name="vehicleId"
            defaultValue={initialFuel?.vehicleId || ""}
            required
          >
            <option value="">Select vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        {type === "fuel" ? (
          <div className="form-grid">
            <Field label="Liters">
              <input
                name="liters"
                type="number"
                step="0.1"
                min="0.1"
                defaultValue={initialFuel?.liters}
                required
              />
            </Field>
            <Field label="Total cost (₹)">
              <input
                name="cost"
                type="number"
                min="1"
                defaultValue={initialFuel?.cost}
                required
              />
            </Field>
            <Field label="Odometer (km)">
              <input
                name="odometerKm"
                type="number"
                min="1"
                defaultValue={initialFuel?.odometerKm}
              />
            </Field>
          </div>
        ) : (
          <>
            <div className="form-grid">
              <Field label="Expense type">
                <select name="type">
                  <option>TOLL</option>
                  <option>REPAIR</option>
                  <option>INSURANCE</option>
                  <option>DRIVER_PAYMENT</option>
                  <option>OTHER</option>
                </select>
              </Field>
              <Field label="Amount (₹)">
                <input name="amount" type="number" min="1" required />
              </Field>
            </div>
            <Field label="Description">
              <input name="description" />
            </Field>
          </>
        )}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save transaction</Button>
        </div>
      </form>
    </Modal>
  );
}

function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [sortBy, setSortBy] = useState<
      "profit" | "revenue" | "operationalCost" | "marginPercent"
    >("profit");
  useEffect(() => {
    api<AnalyticsData>("/analytics")
      .then(setData)
      .catch((reason) => setError((reason as Error).message));
  }, []);
  if (error)
    return (
      <div className="report-error">
        <AlertTriangle />
        <div>
          <b>Analytics could not be generated</b>
          <p>{error}</p>
        </div>
      </div>
    );
  if (!data) return <Loading />;
  const s = data.summary,
    costEntries = [
      { label: "Fuel", value: data.costBreakdown.fuel, color: "#ff6a22" },
      {
        label: "Maintenance",
        value: data.costBreakdown.maintenance,
        color: "#7757c7",
      },
      { label: "Tolls", value: data.costBreakdown.tolls, color: "#3d7fd2" },
      {
        label: "Driver payments",
        value: data.costBreakdown.driverPayments,
        color: "#25a067",
      },
      {
        label: "Other expenses",
        value: data.costBreakdown.otherExpenses,
        color: "#e3a43e",
      },
    ],
    costTotal = costEntries.reduce((total, item) => total + item.value, 0),
    maxCost = Math.max(...costEntries.map((item) => item.value), 1);
  const sortedVehicles = [...data.byVehicle].sort(
      (a, b) => Number(b[sortBy] ?? -Infinity) - Number(a[sortBy] ?? -Infinity),
    ),
    bestVehicle = [...data.byVehicle]
      .filter((row) => row.completedTrips > 0)
      .sort((a, b) => b.profit - a.profit)[0],
    highestCost = [...data.byVehicle].sort(
      (a, b) => b.operationalCost - a.operationalCost,
    )[0],
    attentionCount = data.byVehicle.filter(
      (row) =>
        row.profit < 0 || row.status === "IN_SHOP" || row.status === "RETIRED",
    ).length,
    totalVehicles = data.statusDistribution.reduce(
      (total, row) => total + row.count,
      0,
    ),
    latestTrend = data.monthlyTrend.at(-1),
    previousTrend = data.monthlyTrend.at(-2),
    profitChange =
      previousTrend && previousTrend.profit !== 0
        ? ((latestTrend!.profit - previousTrend.profit) /
            Math.abs(previousTrend.profit)) *
          100
        : null;
  const exportCsv = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_URL}/analytics/export.csv`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Analytics export failed");
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "fleetpilot-fleet-performance.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="report-page">
      <PageTitle
        eyebrow="Performance intelligence"
        title="Reports & analytics"
        description="Realized financial and operational performance from completed trips and recorded fleet costs"
        action={
          <Button variant="ghost" disabled={exporting} onClick={exportCsv}>
            <Download size={17} />{" "}
            {exporting ? "Preparing…" : "Export detailed CSV"}
          </Button>
        }
      />
      <div className="report-audit-strip">
        <ShieldCheck />
        <span>
          <b>Recorded-data report</b>Revenue uses completed trips only. Costs
          include recorded fuel, maintenance and expenses across the workspace.
        </span>
        <small>Generated {dateTime(data.generatedAt)}</small>
      </div>
      <div className="report-kpis">
        <article>
          <span className="report-kpi-icon revenue">
            <WalletCards />
          </span>
          <div>
            <small>Realized revenue</small>
            <b>{money(s.realizedRevenue)}</b>
            <em>{s.completedTrips} completed trips</em>
          </div>
        </article>
        <article>
          <span className="report-kpi-icon cost">
            <CircleDollarSign />
          </span>
          <div>
            <small>Operating cost</small>
            <b>{money(s.operationalCost)}</b>
            <em>
              {s.costPerKm == null
                ? "No completed distance"
                : `${money(s.costPerKm)} per km`}
            </em>
          </div>
        </article>
        <article className={s.realizedProfit < 0 ? "negative" : ""}>
          <span className="report-kpi-icon profit">
            <TrendingUp />
          </span>
          <div>
            <small>Realized profit</small>
            <b>{money(s.realizedProfit)}</b>
            <em>
              {s.profitMargin == null
                ? "Margin unavailable"
                : `${s.profitMargin.toFixed(1)}% margin`}
            </em>
          </div>
        </article>
        <article>
          <span className="report-kpi-icon efficiency">
            <Fuel />
          </span>
          <div>
            <small>Fuel efficiency</small>
            <b>
              {s.fuelEfficiency.toFixed(1)} <i>km/L</i>
            </b>
            <em>{s.totalDistanceKm.toLocaleString("en-IN")} completed km</em>
          </div>
        </article>
        <article>
          <span className="report-kpi-icon utilization">
            <Gauge />
          </span>
          <div>
            <small>Fleet utilization</small>
            <b>
              {s.fleetUtilization.toFixed(1)}
              <i>%</i>
            </b>
            <em>On trip / non-retired fleet</em>
          </div>
        </article>
        <article className={s.vehicleRoi < 0 ? "negative" : ""}>
          <span className="report-kpi-icon roi">
            <BarChart3 />
          </span>
          <div>
            <small>Fleet ROI</small>
            <b>
              {s.vehicleRoi.toFixed(1)}
              <i>%</i>
            </b>
            <em>Profit / acquisition value</em>
          </div>
        </article>
      </div>
      <div className="report-primary-grid">
        <section className="panel report-trend">
          <div className="panel-head">
            <div>
              <span>Six-month trajectory</span>
              <h3>Revenue, cost and realized profit</h3>
            </div>
            <div
              className={`trend-badge ${(profitChange || 0) < 0 ? "down" : ""}`}
            >
              <TrendingUp />
              {profitChange == null
                ? "Baseline"
                : `${profitChange >= 0 ? "+" : ""}${profitChange.toFixed(1)}% profit MoM`}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={275}>
            <AreaChart
              data={data.monthlyTrend}
              margin={{ left: 8, right: 18, top: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff6a22" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#ff6a22" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 5"
                vertical={false}
                stroke="#e9e4dd"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "#7e878f" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 9, fill: "#92999f" }}
                tickFormatter={(value) => `₹${Math.round(value / 1000)}k`}
              />
              <Tooltip
                formatter={(value: any, name: any) => [
                  money(Number(value)),
                  pretty(String(name)),
                ]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e3ddd5",
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#ff6a22"
                fill="url(#revenueFill)"
                strokeWidth={2.5}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#596776"
                fill="transparent"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#25a067"
                fill="transparent"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span>
              <i className="revenue" />
              Revenue
            </span>
            <span>
              <i className="cost" />
              Cost
            </span>
            <span>
              <i className="profit" />
              Profit
            </span>
          </div>
        </section>
        <section className="panel report-cost-mix">
          <div className="panel-head">
            <div>
              <span>Cost structure</span>
              <h3>Where the money goes</h3>
            </div>
            <strong>{money(costTotal)}</strong>
          </div>
          <div className="cost-mix-list">
            {costEntries.map((item) => (
              <div key={item.label}>
                <header>
                  <span>
                    <i style={{ background: item.color }} />
                    {item.label}
                  </span>
                  <b>{money(item.value)}</b>
                </header>
                <div>
                  <i
                    style={{
                      width: `${(item.value / maxCost) * 100}%`,
                      background: item.color,
                    }}
                  />
                </div>
                <small>
                  {costTotal
                    ? `${((item.value / costTotal) * 100).toFixed(1)}% of operating cost`
                    : "No cost recorded"}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="report-secondary-grid">
        <section className="panel report-insights">
          <div className="panel-head">
            <div>
              <span>Decision support</span>
              <h3>Operational signals</h3>
            </div>
            <small>Automatically derived</small>
          </div>
          <div className="insight-grid">
            <article className="positive">
              <TrendingUp />
              <span>
                <small>Top profit contributor</small>
                <b>{bestVehicle?.name || "No completed trips"}</b>
                <em>
                  {bestVehicle
                    ? `${money(bestVehicle.profit)} realized profit`
                    : "Complete a trip to establish a baseline"}
                </em>
              </span>
            </article>
            <article>
              <CircleDollarSign />
              <span>
                <small>Highest recorded cost</small>
                <b>{highestCost?.name || "No cost data"}</b>
                <em>
                  {highestCost
                    ? `${money(highestCost.operationalCost)} total spend`
                    : "No costs recorded"}
                </em>
              </span>
            </article>
            <article className={attentionCount ? "warning" : ""}>
              <AlertTriangle />
              <span>
                <small>Assets requiring review</small>
                <b>{attentionCount} vehicles</b>
                <em>Loss-making, in shop or retired</em>
              </span>
            </article>
          </div>
        </section>
        <section className="panel report-status">
          <div className="panel-head">
            <div>
              <span>Fleet readiness</span>
              <h3>Vehicle status mix</h3>
            </div>
            <strong>{s.activeVehicles} operational</strong>
          </div>
          <div
            className="status-stack"
            aria-label="Vehicle status distribution"
          >
            {data.statusDistribution.map((row, index) => (
              <i
                key={row.status}
                className={`status-segment status-${index}`}
                style={{
                  width: `${totalVehicles ? (row.count / totalVehicles) * 100 : 0}%`,
                }}
                title={`${pretty(row.status)}: ${row.count}`}
              />
            ))}
          </div>
          <div className="status-legend">
            {data.statusDistribution.map((row, index) => (
              <div key={row.status}>
                <i className={`status-${index}`} />
                <span>{pretty(row.status)}</span>
                <b>{row.count}</b>
                <small>
                  {totalVehicles
                    ? `${((row.count / totalVehicles) * 100).toFixed(0)}%`
                    : "0%"}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel report-table">
        <div className="panel-head">
          <div>
            <span>Asset-level performance</span>
            <h3>Vehicle profitability scorecard</h3>
          </div>
          <label>
            Rank by
            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as typeof sortBy)
              }
            >
              <option value="profit">Profit</option>
              <option value="revenue">Revenue</option>
              <option value="operationalCost">Operating cost</option>
              <option value="marginPercent">Margin</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table aria-label="Vehicle profitability scorecard">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Completed</th>
                <th>Distance</th>
                <th>Revenue</th>
                <th>Operating cost</th>
                <th>Profit</th>
                <th>Margin</th>
                <th>Cost / km</th>
                <th>ROI</th>
              </tr>
            </thead>
            <tbody>
              {sortedVehicles.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="report-vehicle">
                      <span>
                        <Truck />
                      </span>
                      <div>
                        <b>{row.name}</b>
                        <small>
                          {row.registrationNo} · {row.type}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Status value={row.status} />
                  </td>
                  <td>
                    {row.completedTrips}
                    <small>{row.totalTrips} total</small>
                  </td>
                  <td>{row.distanceKm.toLocaleString("en-IN")} km</td>
                  <td>
                    <b>{money(row.revenue)}</b>
                  </td>
                  <td>
                    {money(row.operationalCost)}
                    <small>Fuel {money(row.fuelCost)}</small>
                  </td>
                  <td
                    className={
                      row.profit < 0 ? "metric-negative" : "metric-positive"
                    }
                  >
                    <b>{money(row.profit)}</b>
                  </td>
                  <td>
                    {row.marginPercent == null
                      ? "—"
                      : `${row.marginPercent.toFixed(1)}%`}
                  </td>
                  <td>{row.costPerKm == null ? "—" : money(row.costPerKm)}</td>
                  <td
                    className={
                      (row.roi || 0) < 0 ? "metric-negative" : "metric-positive"
                    }
                  >
                    {row.roi == null ? "—" : `${row.roi.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  googleSub?: string;
};
function SettingsPage({ user }: { user: User }) {
  const [organization, setOrganization] = useState({
      name: user.organizationName,
      operationsEmail: "",
    }),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<{ name: string; operationsEmail?: string }>("/organization").then(
      (org) =>
        setOrganization({
          name: org.name,
          operationsEmail: org.operationsEmail || "",
        }),
    );
  }, []);
  async function saveOrganization(e: FormEvent) {
    e.preventDefault();
    await api("/organization", {
      method: "PUT",
      body: JSON.stringify(organization),
    });
    setMessage("Company profile saved");
    setTimeout(() => setMessage(""), 2500);
  }
  return (
    <>
      <PageTitle
        eyebrow="Company administration"
        title="Company settings"
        description={`Manage the profile for ${user.organizationName}. This workspace is isolated from every other organization.`}
      />
      {message && (
        <div className="notice compact">
          <span>
            <Check />
          </span>
          <div>
            <b>{message}</b>
          </div>
        </div>
      )}
      <form
        className="panel settings-card company-settings"
        onSubmit={saveOrganization}
      >
        <div className="panel-head">
          <div>
            <span>Workspace</span>
            <h3>Organization profile</h3>
          </div>
        </div>
        <Field label="Transport company name">
          <input
            value={organization.name}
            onChange={(e) =>
              setOrganization({ ...organization, name: e.target.value })
            }
            required
          />
        </Field>
        <Field label="Operations email">
          <input
            type="email"
            value={organization.operationsEmail}
            onChange={(e) =>
              setOrganization({
                ...organization,
                operationsEmail: e.target.value,
              })
            }
          />
        </Field>
        <div className="owner-note">
          <Building2 />
          <span>
            <b>Organization-isolated workspace</b>Only records belonging to{" "}
            {user.organizationName} are available in this account.
          </span>
        </div>
        <Button>Save company profile</Button>
      </form>
    </>
  );
}
type ProfitabilityTrip = {
  id: string;
  tripNo: string;
  source: string;
  destination: string;
  status: string;
  revenue: number;
  plannedDistanceKm: number;
  estimatedTollsInr?: number | null;
  estimatedFuelCostInr?: number | null;
  estimatedMaintenanceCostInr?: number | null;
  estimatedTripCostInr?: number | null;
  estimatedProfitInr?: number | null;
  estimatedProfitMarginPercent?: number | null;
  profitabilityEstimatedAt?: string | null;
  actualFuelCostInr?: number | null;
  actualMaintenanceCostInr?: number | null;
  actualExpenseCostInr?: number | null;
  actualDriverPayoutInr?: number | null;
  actualTollCostInr?: number | null;
  actualTripCostInr?: number | null;
  actualProfitInr?: number | null;
  actualProfitMarginPercent?: number | null;
  profitabilityFinalizedAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
  vehicle: { name: string; registrationNo: string };
  driver: { name: string };
};
type ProfitabilityResponse = {
  summary: {
    trackedTrips: number;
    completedTrips: number;
    estimatedProfit: number;
    actualProfit: number;
    profitVariance: number;
    actualRevenue: number;
    actualCost: number;
  };
  trips: ProfitabilityTrip[];
  syncedAt: string;
};
function ProfitabilityPage() {
  const [data, setData] = useState<ProfitabilityResponse | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState<"ALL" | "PLANNED" | "COMPLETED">("ALL");
  const load = useCallback(() => {
    setError("");
    api<ProfitabilityResponse>("/profitability")
      .then(setData)
      .catch((reason) => setError((reason as Error).message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data && !error) return <Loading />;
  const rows = (data?.trips || []).filter((trip) =>
      filter === "ALL" || filter === "COMPLETED"
        ? filter === "ALL" || trip.status === "COMPLETED"
        : trip.status !== "COMPLETED",
    ),
    summary = data?.summary;
  return (
    <>
      <PageTitle
        eyebrow="Trip economics"
        title="Profitability"
        description="Planning estimates synchronize with linked trip costs and become a realized profit log when each trip is completed."
        action={
          <Button variant="ghost" onClick={load}>
            <Activity /> Sync now
          </Button>
        }
      />
      {error && (
        <div className="alert">
          <X />
          {error}
        </div>
      )}
      {summary && (
        <>
          <div className="profit-sync-banner">
            <span>
              <Activity />
            </span>
            <div>
              <b>Profitability synchronization active</b>
              <p>
                Dispatch refreshes the planning snapshot. Completion finalizes
                logged fuel, maintenance, toll, driver payout and other trip
                expenses.
              </p>
            </div>
            <small>Synced {data ? dateTime(data.syncedAt) : "—"}</small>
          </div>
          <div className="profitability-summary">
            <div>
              <span>Realized profit</span>
              <b className={summary.actualProfit < 0 ? "loss" : ""}>
                {money(summary.actualProfit)}
              </b>
              <small>{summary.completedTrips} completed trips</small>
            </div>
            <div>
              <span>Logged revenue</span>
              <b>{money(summary.actualRevenue)}</b>
              <small>Completed-trip revenue</small>
            </div>
            <div>
              <span>Logged actual cost</span>
              <b>{money(summary.actualCost)}</b>
              <small>Only linked cost records</small>
            </div>
            <div>
              <span>Estimate variance</span>
              <b className={summary.profitVariance < 0 ? "loss" : "positive"}>
                {summary.profitVariance > 0 ? "+" : ""}
                {money(summary.profitVariance)}
              </b>
              <small>Actual minus planned profit</small>
            </div>
          </div>
          <div className="profitability-toolbar">
            <div>
              <button
                className={filter === "ALL" ? "active" : ""}
                onClick={() => setFilter("ALL")}
              >
                All trips
              </button>
              <button
                className={filter === "PLANNED" ? "active" : ""}
                onClick={() => setFilter("PLANNED")}
              >
                Planned / active
              </button>
              <button
                className={filter === "COMPLETED" ? "active" : ""}
                onClick={() => setFilter("COMPLETED")}
              >
                Completed log
              </button>
            </div>
            <span>{rows.length} records</span>
          </div>
          <section className="panel profitability-ledger">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trip</th>
                    <th>Assignment</th>
                    <th>Revenue</th>
                    <th>Planned profit</th>
                    <th>Realized profit</th>
                    <th>Variance</th>
                    <th>Cost synchronization</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((trip) => {
                    const completed = trip.status === "COMPLETED",
                      variance =
                        completed &&
                        trip.actualProfitInr != null &&
                        trip.estimatedProfitInr != null
                          ? trip.actualProfitInr - trip.estimatedProfitInr
                          : null,
                      linkedCosts =
                        (trip.actualFuelCostInr || 0) +
                        (trip.actualMaintenanceCostInr || 0) +
                        (trip.actualExpenseCostInr || 0) +
                        (trip.actualDriverPayoutInr || 0) +
                        (trip.actualTollCostInr || 0);
                    return (
                      <tr key={trip.id}>
                        <td>
                          <b>{trip.tripNo}</b>
                          <small>
                            {trip.source} → {trip.destination}
                          </small>
                        </td>
                        <td>
                          <b>{trip.vehicle.name}</b>
                          <small>
                            {trip.driver.name} ·{" "}
                            {trip.plannedDistanceKm.toLocaleString("en-IN")} km
                          </small>
                        </td>
                        <td>
                          <b>{money(trip.revenue)}</b>
                        </td>
                        <td>
                          <b
                            className={
                              (trip.estimatedProfitInr || 0) < 0
                                ? "expired"
                                : ""
                            }
                          >
                            {trip.estimatedProfitInr == null
                              ? "Pending"
                              : money(trip.estimatedProfitInr)}
                          </b>
                          <small>
                            {trip.estimatedProfitMarginPercent == null
                              ? "Partial estimate"
                              : `${trip.estimatedProfitMarginPercent.toFixed(1)}% margin`}
                          </small>
                        </td>
                        <td>
                          {completed ? (
                            <>
                              <b
                                className={
                                  (trip.actualProfitInr || 0) < 0
                                    ? "expired"
                                    : "profit-positive"
                                }
                              >
                                {money(trip.actualProfitInr || 0)}
                              </b>
                              <small>
                                {trip.actualProfitMarginPercent == null
                                  ? "No margin"
                                  : `${trip.actualProfitMarginPercent.toFixed(1)}% margin`}
                              </small>
                            </>
                          ) : (
                            <span className="profit-pending">
                              Finalizes on completion
                            </span>
                          )}
                        </td>
                        <td>
                          {variance == null ? (
                            "—"
                          ) : (
                            <b
                              className={
                                variance < 0 ? "expired" : "profit-positive"
                              }
                            >
                              {variance > 0 ? "+" : ""}
                              {money(variance)}
                            </b>
                          )}
                        </td>
                        <td>
                          {completed ? (
                            <div className="cost-sync-cell">
                              <span
                                className={
                                  linkedCosts > 0 ? "synced" : "waiting"
                                }
                              >
                                <i />
                                {linkedCosts > 0
                                  ? "Costs linked"
                                  : "No linked costs yet"}
                              </span>
                              <small>
                                Fuel {money(trip.actualFuelCostInr || 0)} · Toll{" "}
                                {money(trip.actualTollCostInr || 0)} · Driver{" "}
                                {money(trip.actualDriverPayoutInr || 0)}
                              </small>
                            </div>
                          ) : (
                            <span className="profit-pending">
                              Awaiting completion
                            </span>
                          )}
                        </td>
                        <td>
                          <Status value={trip.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && (
                <Empty text="No profitability records match this view." />
              )}
            </div>
          </section>
          <div className="profitability-footnote">
            <ShieldCheck />
            <span>
              <b>Data integrity note</b>“Realized” profit includes only costs
              linked to that trip. A zero cost is shown as unlinked—not silently
              treated as a verified zero-cost operation.
            </span>
          </div>
        </>
      )}
    </>
  );
}
type AccessDriverDocument = {
  id: string;
  type: "PROFILE_PHOTO" | "LICENSE_FRONT" | "LICENSE_BACK" | string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};
type AccessDriverProfile = {
  id: string;
  licenseNo: string;
  licenseCategory: LicenseCategory;
  licenseExpiry: string;
  onboardingStatus: "PENDING" | "NEEDS_REVIEW" | "VERIFIED" | "REJECTED";
  reviewNote?: string | null;
  status: "AVAILABLE" | "ON_TRIP" | "OFF_DUTY" | "SUSPENDED";
  payType?: "PER_TRIP" | "HOURLY";
  payRate?: number;
  createdAt: string;
  documents: AccessDriverDocument[];
};
type AccessMember = Member & {
  lastActiveAt?: string;
  driver?: AccessDriverProfile | null;
};
const accessModules: Record<Role, string[]> = {
  OWNER: [
    "Overview",
    "Fleet registry",
    "Drivers",
    "Driver access",
    "Trip dispatch",
    "Profitability",
    "Maintenance",
    "Fuel & expenses",
    "Reports",
    "Company settings",
    "User access",
  ],
  ADMIN: [
    "Overview",
    "Fleet registry",
    "Drivers",
    "Driver access",
    "Trip dispatch",
    "Profitability",
    "Maintenance",
    "Fuel & expenses",
    "Reports",
    "Company settings",
    "User access",
  ],
  FLEET_MANAGER: [
    "Overview",
    "Fleet registry",
    "Drivers",
    "Driver access",
    "Trip dispatch",
    "Profitability",
    "Maintenance",
    "Fuel & expenses",
  ],
  DISPATCHER: ["Overview", "Trip dispatch", "Profitability"],
  SAFETY_OFFICER: ["Overview", "Drivers"],
  FINANCIAL_ANALYST: ["Overview", "Profitability", "Fuel & expenses"],
  DRIVER: ["Driver mobile portal"],
};
function AccessInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Role & module access" onClose={onClose} wide>
      <div className="access-info-modal">
        <div className="access-info-intro">
          <ShieldCheck />
          <span>
            <b>Server-enforced access</b>Menus are only the visible layer. Every
            API request is checked again against the signed-in user’s role and
            organization.
          </span>
        </div>
        <div className="access-role-grid">
          {roles.map((role) => (
            <article key={role}>
              <header>
                <span className={`access-role-icon role-${role.toLowerCase()}`}>
                  <UserRound />
                </span>
                <div>
                  <b>{roleLabel[role]}</b>
                  <small>
                    {role === "OWNER"
                      ? "Full workspace control"
                      : role === "DRIVER"
                        ? "Mobile operations only"
                        : `${accessModules[role].length} modules enabled`}
                  </small>
                </div>
              </header>
              <div>
                {accessModules[role].map((module) => (
                  <span key={module}>
                    <Check /> {module}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </Modal>
  );
}
function CreateAccessModal({
  kind,
  currentUser,
  onClose,
  onSaved,
}: {
  kind: "driver" | "team";
  currentUser: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [role, setRole] = useState<Role>("DISPATCHER"),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      await api(kind === "driver" ? "/driver-access" : "/users", {
        method: "POST",
        body: JSON.stringify(
          kind === "driver" ? payload : { ...payload, role },
        ),
      });
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  const teamRoles = assignableRoles.filter(
    (item) =>
      item !== "DRIVER" && (currentUser.role === "OWNER" || item !== "ADMIN"),
  );
  return (
    <Modal
      title={
        kind === "driver" ? "Create driver access" : "Add organization user"
      }
      onClose={onClose}
    >
      <form className="modal-form access-create-form" onSubmit={save}>
        {error && (
          <div className="alert">
            <X />
            {error}
          </div>
        )}
        <div className="access-create-banner">
          {kind === "driver" ? <UsersRound /> : <ShieldCheck />}
          <span>
            <b>
              {kind === "driver"
                ? "Linked driver identity"
                : "Role-based team identity"}
            </b>
            {kind === "driver"
              ? "Creates one login and its linked driver record. Licence documents are completed from the driver portal."
              : "Creates a non-driver workspace account with server-enforced module access."}
          </span>
        </div>
        <div className="form-grid">
          <Field label="Full name">
            <input name="name" required />
          </Field>
          <Field label="Work email">
            <input name="email" type="email" required />
          </Field>
          {kind === "team" ? (
            <Field label="Access role">
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {teamRoles.map((item) => (
                  <option value={item} key={item}>
                    {roleLabel[item]}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Contact number">
                <input name="contact" type="tel" minLength={7} required />
              </Field>
              <Field label="Pay model">
                <select name="payType" defaultValue="PER_TRIP">
                  <option value="PER_TRIP">Per trip</option>
                  <option value="HOURLY">Hourly</option>
                </select>
              </Field>
              <Field label="Pay rate (₹)">
                <input
                  name="payRate"
                  type="number"
                  min="0"
                  defaultValue="0"
                  required
                />
              </Field>
            </>
          )}
          <Field label="Temporary password">
            <input
              name="password"
              type="password"
              minLength={10}
              pattern="(?=.*[A-Z])(?=.*[0-9]).{10,}"
              title="At least 10 characters with one uppercase letter and one number"
              required
            />
          </Field>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy
              ? "Creating…"
              : kind === "driver"
                ? "Create driver login"
                : "Add user"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function DriverAccessPage({ user }: { user: User }) {
  const [members, setMembers] = useState<AccessMember[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [adding, setAdding] = useState(false),
    [review, setReview] = useState<Driver | null>(null),
    [info, setInfo] = useState(false);
  const load = useCallback(
    () =>
      api<AccessMember[]>("/users").then((rows) =>
        setMembers(
          rows.filter(
            (member) => member.role === "DRIVER" || Boolean(member.driver),
          ),
        ),
      ),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (members.length && !members.some((member) => member.id === selectedId))
      setSelectedId(members[0].id);
  }, [members, selectedId]);
  const selected =
      members.find((member) => member.id === selectedId) || members[0],
    driver = selected?.driver;
  const required = [
      { type: "PROFILE_PHOTO", label: "Profile photo" },
      { type: "LICENSE_FRONT", label: "Licence front" },
      { type: "LICENSE_BACK", label: "Licence back" },
    ],
    uploaded = new Set(
      driver?.documents.map((document) => document.type) || [],
    ),
    complete = required.filter((item) => uploaded.has(item.type)).length;
  return (
    <>
      <PageTitle
        eyebrow="Driver identity"
        title="Driver access"
        description="Create linked driver logins, monitor mobile onboarding and review private licence documents."
        action={
          <div className="access-title-actions">
            <Button variant="ghost" onClick={() => setInfo(true)}>
              <ShieldCheck /> Access info
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> New driver access
            </Button>
          </div>
        }
      />
      <div className="access-summary-grid">
        <div>
          <UsersRound />
          <span>
            <small>Linked drivers</small>
            <b>{members.length}</b>
          </span>
        </div>
        <div>
          <AlertTriangle />
          <span>
            <small>Needs review</small>
            <b>
              {
                members.filter(
                  (member) =>
                    member.driver?.onboardingStatus === "NEEDS_REVIEW",
                ).length
              }
            </b>
          </span>
        </div>
        <div>
          <FileText />
          <span>
            <small>Documents uploaded</small>
            <b>
              {members.reduce(
                (sum, member) => sum + (member.driver?.documents.length || 0),
                0,
              )}
            </b>
          </span>
        </div>
      </div>
      <div className="driver-access-layout">
        <section className="panel driver-access-list">
          <header>
            <span>Driver identities</span>
            <b>Select a driver</b>
          </header>
          {members.map((member) => (
            <button
              type="button"
              className={selected?.id === member.id ? "active" : ""}
              onClick={() => setSelectedId(member.id)}
              key={member.id}
            >
              <span className="person">
                <UserRound />
              </span>
              <span>
                <b>{member.name}</b>
                <small>{member.email}</small>
              </span>
              <Status value={member.driver?.onboardingStatus || "PENDING"} />
            </button>
          ))}
          {!members.length && (
            <Empty text="Create the first linked driver account." />
          )}
        </section>
        <section className="panel driver-access-profile">
          {selected && driver ? (
            <>
              <div className="driver-access-profile-head">
                <div className="entity">
                  <span className="person">
                    <UserRound />
                  </span>
                  <div>
                    <b>{selected.name}</b>
                    <small>
                      {selected.email} · {driver.status.replaceAll("_", " ")}
                    </small>
                  </div>
                </div>
                <Status value={driver.onboardingStatus} />
              </div>
              <div className="driver-access-facts">
                <span>
                  <small>Licence</small>
                  <b>
                    {driver.licenseNo.startsWith("PENDING-")
                      ? "Pending upload"
                      : driver.licenseNo}
                  </b>
                </span>
                <span>
                  <small>Category</small>
                  <b>
                    {driver.licenseNo.startsWith("PENDING-")
                      ? "Pending"
                      : driver.licenseCategory}
                  </b>
                </span>
                <span>
                  <small>Pay rule</small>
                  <b>
                    {driver.payType === "HOURLY" ? "Hourly" : "Per trip"} ·{" "}
                    {money(driver.payRate || 0)}
                  </b>
                </span>
                <span>
                  <small>Last active</small>
                  <b>
                    {selected.lastActiveAt
                      ? dateTime(selected.lastActiveAt)
                      : "Never"}
                  </b>
                </span>
              </div>
              <div className="driver-doc-progress">
                <div>
                  <span>Onboarding documents</span>
                  <b>
                    {complete}/{required.length}
                  </b>
                </div>
                <i>
                  <em
                    style={{ width: `${(complete / required.length) * 100}%` }}
                  />
                </i>
              </div>
              <div className="driver-access-docs">
                {required.map((item) => {
                  const document = driver.documents.find(
                    (row) => row.type === item.type,
                  );
                  return (
                    <div
                      className={document ? "complete" : "missing"}
                      key={item.type}
                    >
                      <FileText />
                      <span>
                        <b>{item.label}</b>
                        <small>
                          {document
                            ? `${document.originalName} · ${dateTime(document.createdAt)}`
                            : "Awaiting driver mobile upload"}
                        </small>
                      </span>
                      {document ? <Check /> : <AlertTriangle />}
                    </div>
                  );
                })}
              </div>
              {driver.reviewNote && (
                <div className="review-note">
                  <AlertTriangle />
                  <span>
                    <b>Correction requested</b>
                    {driver.reviewNote}
                  </span>
                </div>
              )}
              <div className="driver-access-footer">
                <span>
                  <ShieldCheck /> Driver creation is restricted to this module.
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setReview({
                      id: driver.id,
                      name: selected.name,
                      licenseNo: driver.licenseNo,
                      licenseCategory: driver.licenseCategory,
                      licenseExpiry: driver.licenseExpiry,
                      contact: selected.email,
                      payType: driver.payType,
                      payRate: driver.payRate,
                      safetyScore: 0,
                      status: driver.status,
                      userId: selected.id,
                      onboardingStatus: driver.onboardingStatus,
                      reviewNote: driver.reviewNote,
                    })
                  }
                >
                  Review documents
                </Button>
              </div>
            </>
          ) : (
            <Empty text="Select a driver identity to inspect onboarding." />
          )}
        </section>
      </div>
      {adding && (
        <CreateAccessModal
          kind="driver"
          currentUser={user}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {review && (
        <DriverOnboardingReview
          driver={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            load();
          }}
        />
      )}
      {info && <AccessInfoModal onClose={() => setInfo(false)} />}
    </>
  );
}
function TeamAccessPage({ user }: { user: User }) {
  const [members, setMembers] = useState<AccessMember[]>([]),
    [adding, setAdding] = useState(false),
    [info, setInfo] = useState(false);
  const load = useCallback(
    () =>
      api<AccessMember[]>("/users").then((rows) =>
        setMembers(
          rows.filter((member) => member.role !== "DRIVER" && !member.driver),
        ),
      ),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function update(
    member: AccessMember,
    data: Partial<{ role: Role; isActive: boolean }>,
  ) {
    await api(`/users/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    load();
  }
  return (
    <>
      <PageTitle
        eyebrow="Identity & access"
        title="User access"
        description={`Manage non-driver team identities and role permissions for ${user.organizationName}.`}
        action={
          <div className="access-title-actions">
            <Button variant="ghost" onClick={() => setInfo(true)}>
              <ShieldCheck /> Who can access what?
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add user
            </Button>
          </div>
        }
      />
      <div className="access-scope enhanced">
        <Building2 />
        <div>
          <b>{user.organizationName}</b>
          <span>
            All identities and operational records remain isolated inside this
            workspace.
          </span>
        </div>
        <span>
          {members.filter((member) => member.isActive).length} active users
        </span>
      </div>
      <section className="panel team-access-panel">
        <div className="panel-head">
          <div>
            <span>Organization team</span>
            <h3>People & permissions</h3>
          </div>
          <small>
            Driver identities are managed separately in Driver access.
          </small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Enabled modules</th>
                <th>Last active</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="entity">
                      <span className="person">
                        <UserRound />
                      </span>
                      <div>
                        <b>{member.name}</b>
                        <small>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {member.role === "OWNER" ? (
                      <span className="owner-badge">
                        <ShieldCheck /> Company Owner
                      </span>
                    ) : (
                      <select
                        className="role-select"
                        value={member.role}
                        onChange={(event) =>
                          update(member, { role: event.target.value as Role })
                        }
                      >
                        {assignableRoles
                          .filter(
                            (role) =>
                              role !== "DRIVER" &&
                              (user.role === "OWNER" || role !== "ADMIN"),
                          )
                          .map((role) => (
                            <option value={role} key={role}>
                              {roleLabel[role]}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="module-count-button"
                      onClick={() => setInfo(true)}
                    >
                      {accessModules[member.role].length} modules{" "}
                      <ExternalLink />
                    </button>
                  </td>
                  <td>
                    {member.lastActiveAt
                      ? dateTime(member.lastActiveAt)
                      : "Never signed in"}
                  </td>
                  <td>
                    <Status value={member.isActive ? "ACTIVE" : "SUSPENDED"} />
                  </td>
                  <td className="actions">
                    {member.role !== "OWNER" && (
                      <button
                        onClick={() =>
                          update(member, { isActive: !member.isActive })
                        }
                      >
                        {member.isActive ? "Suspend" : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!members.length && <Empty text="No non-driver users found." />}
        </div>
      </section>
      {adding && (
        <CreateAccessModal
          kind="team"
          currentUser={user}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {info && <AccessInfoModal onClose={() => setInfo(false)} />}
    </>
  );
}
function UserAccessPage({ user }: { user: User }) {
  const [members, setMembers] = useState<AccessMember[]>([]),
    [adding, setAdding] = useState<Role | null>(null),
    [review, setReview] = useState<Driver | null>(null),
    [selectedDriverId, setSelectedDriverId] = useState("");
  const load = useCallback(
    () => api<AccessMember[]>("/users").then(setMembers),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function updateMember(
    member: AccessMember,
    data: Partial<{ role: Role; isActive: boolean }>,
  ) {
    try {
      await api(`/users/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  const roleAccess = (r: Role, area: string) =>
    ["OWNER", "ADMIN"].includes(r) ||
    (
      {
        fleet: ["FLEET_MANAGER"],
        trips: ["FLEET_MANAGER", "DISPATCHER"],
        safety: ["FLEET_MANAGER", "SAFETY_OFFICER"],
        finance: ["FLEET_MANAGER", "FINANCIAL_ANALYST"],
        driver: ["DRIVER", "FLEET_MANAGER", "SAFETY_OFFICER"],
      } as Record<string, string[]>
    )[area]?.includes(r);
  const driverMembers = members.filter(
    (member) => member.role === "DRIVER" || Boolean(member.driver),
  );
  useEffect(() => {
    if (
      driverMembers.length &&
      !driverMembers.some((member) => member.id === selectedDriverId)
    )
      setSelectedDriverId(driverMembers[0].id);
  }, [driverMembers, selectedDriverId]);
  const selectedDriverMember =
    driverMembers.find((member) => member.id === selectedDriverId) ||
    driverMembers[0];
  const requiredDocs: Array<{
    type: "PROFILE_PHOTO" | "LICENSE_FRONT" | "LICENSE_BACK";
    label: string;
  }> = [
    { type: "PROFILE_PHOTO", label: "Profile photo" },
    { type: "LICENSE_FRONT", label: "Licence front" },
    { type: "LICENSE_BACK", label: "Licence back" },
  ];
  const needsReview = driverMembers.filter(
    (member) => member.driver?.onboardingStatus === "NEEDS_REVIEW",
  ).length;
  return (
    <>
      <PageTitle
        eyebrow="Identity & access"
        title="User access"
        description={`Invite people, assign their role, and review activity for ${user.organizationName}.`}
        action={
          <Button onClick={() => setAdding("DISPATCHER")}>
            <Plus /> Add user
          </Button>
        }
      />
      <div className="access-scope">
        <Building2 />
        <div>
          <b>{user.organizationName}</b>
          <span>
            Users and operational data are visible only inside this
            organization.
          </span>
        </div>
        <ShieldCheck />
      </div>
      <section className="panel driver-access-panel driver-access-priority">
        <div className="panel-head">
          <div>
            <span>Driver module</span>
            <h3>Driver access & document tracking</h3>
          </div>
          <div className="panel-head-actions">
            <small>
              {driverMembers.length} linked drivers · {needsReview} need review
            </small>
            <Button onClick={() => setAdding("DRIVER")}>
              <Plus size={16} /> New driver access
            </Button>
          </div>
        </div>
        <div className="driver-module-toolbar">
          <label>
            <span>Select driver</span>
            <select
              value={selectedDriverMember?.id || ""}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">No driver selected</option>
              {driverMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.email}
                </option>
              ))}
            </select>
          </label>
          <div>
            <small>Driver payout</small>
            <b>
              {selectedDriverMember?.driver
                ? `${selectedDriverMember.driver.payType === "HOURLY" ? "Hourly" : "Per trip"} · ${money(selectedDriverMember.driver.payRate || 0)}`
                : "Not configured"}
            </b>
          </div>
        </div>
        <div className="driver-track-grid">
          {selectedDriverMember ? (
            [selectedDriverMember].map((member) => {
              const driver = member.driver;
              const uploaded = new Set(
                driver?.documents.map((document) => document.type) || [],
              );
              const complete = requiredDocs.filter((doc) =>
                uploaded.has(doc.type),
              ).length;
              const lastDocument = driver?.documents[0];
              const licenceExpired = Boolean(
                driver &&
                !driver.licenseNo.startsWith("PENDING-") &&
                new Date(driver.licenseExpiry) < new Date(),
              );
              return (
                <article className="driver-track-card" key={member.id}>
                  <div className="driver-track-head">
                    <div className="entity">
                      <span className="person">
                        <UserRound />
                      </span>
                      <div>
                        <b>{member.name}</b>
                        <small>{member.email}</small>
                      </div>
                    </div>
                    <Status value={driver?.onboardingStatus || "PENDING"} />
                  </div>
                  <div className="driver-track-meta">
                    <span>
                      <small>User ID</small>
                      <code>{member.id}</code>
                    </span>
                    <span>
                      <small>Driver ID</small>
                      <code>{driver?.id || "Not created"}</code>
                    </span>
                    <span>
                      <small>User created</small>
                      <b>{date(member.createdAt)}</b>
                    </span>
                  </div>
                  {driver ? (
                    <>
                      <div className="driver-license-strip">
                        <span>
                          <small>Licence</small>
                          <b>
                            {driver.licenseNo.startsWith("PENDING-")
                              ? "Pending upload"
                              : driver.licenseNo}
                          </b>
                        </span>
                        <span>
                          <small>Category</small>
                          <b>{driver.licenseCategory}</b>
                        </span>
                        <span>
                          <small>Expiry</small>
                          <b className={licenceExpired ? "expired" : ""}>
                            {driver.licenseNo.startsWith("PENDING-")
                              ? "Not submitted"
                              : date(driver.licenseExpiry)}
                          </b>
                        </span>
                      </div>
                      <div className="doc-progress">
                        <span>Documents updated</span>
                        <b>
                          {complete}/{requiredDocs.length}
                        </b>
                        <i>
                          <em
                            style={{
                              width: `${(complete / requiredDocs.length) * 100}%`,
                            }}
                          />
                        </i>
                      </div>
                      <div className="doc-checklist">
                        {requiredDocs.map((doc) => {
                          const uploadedDoc = driver.documents.find(
                            (document) => document.type === doc.type,
                          );
                          return (
                            <div
                              className={`doc-row ${uploadedDoc ? "" : "missing"}`}
                              key={doc.type}
                            >
                              <FileText />
                              <span>
                                <b>{doc.label}</b>
                                <small>
                                  {uploadedDoc
                                    ? `${uploadedDoc.originalName} · ${dateTime(uploadedDoc.createdAt)}`
                                    : "Missing from driver mobile onboarding"}
                                </small>
                              </span>
                              {uploadedDoc ? <Check /> : <AlertTriangle />}
                            </div>
                          );
                        })}
                      </div>
                      <div className="driver-audit-row">
                        <span>
                          <Activity /> Last document update:{" "}
                          <b>
                            {lastDocument
                              ? dateTime(lastDocument.createdAt)
                              : "No uploads yet"}
                          </b>
                        </span>
                        <span>
                          Last active:{" "}
                          <b>
                            {member.lastActiveAt
                              ? dateTime(member.lastActiveAt)
                              : "Never signed in"}
                          </b>
                        </span>
                      </div>
                      <div className="actions driver-actions">
                        <button
                          onClick={() =>
                            setReview({
                              id: driver.id,
                              name: member.name,
                              licenseNo: driver.licenseNo,
                              licenseCategory: driver.licenseCategory,
                              licenseExpiry: driver.licenseExpiry,
                              contact: member.email,
                              payType: driver.payType,
                              payRate: driver.payRate,
                              safetyScore: 0,
                              status: driver.status,
                              userId: member.id,
                              onboardingStatus: driver.onboardingStatus,
                              reviewNote: driver.reviewNote,
                            })
                          }
                        >
                          Review documents
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="driver-empty-state">
                      <AlertTriangle />
                      <span>
                        <b>Mobile profile not created</b>This driver user has
                        access, but no linked driver record is available yet.
                      </span>
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <Empty text="Driver accounts created from New driver access will appear here." />
          )}
        </div>
      </section>
      <section className="panel team-panel">
        <div className="panel-head">
          <div>
            <span>Identity & access</span>
            <h3>Organization users</h3>
          </div>
          <small>
            {members.filter((m) => m.isActive).length} active · {members.length}{" "}
            total
          </small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Access role</th>
                <th>Sign-in</th>
                <th>Last active</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="entity">
                      <span className="person">
                        <UserRound />
                      </span>
                      <div>
                        <b>{member.name}</b>
                        <small>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {member.role === "OWNER" ? (
                      <span className="owner-badge">
                        <ShieldCheck /> Company Owner
                      </span>
                    ) : (
                      <select
                        className="role-select"
                        value={member.role}
                        onChange={(e) =>
                          updateMember(member, { role: e.target.value as Role })
                        }
                      >
                        {assignableRoles
                          .filter((r) => user.role === "OWNER" || r !== "ADMIN")
                          .map((r) => (
                            <option value={r} key={r}>
                              {roleLabel[r]}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className="auth-method">
                      {member.googleSub
                        ? "Google + password"
                        : "Email & password"}
                    </span>
                  </td>
                  <td>
                    {member.lastActiveAt
                      ? dateTime(member.lastActiveAt)
                      : "Never signed in"}
                  </td>
                  <td>
                    <Status value={member.isActive ? "ACTIVE" : "SUSPENDED"} />
                  </td>
                  <td className="actions">
                    {member.role !== "OWNER" && (
                      <button
                        onClick={() =>
                          updateMember(member, { isActive: !member.isActive })
                        }
                      >
                        {member.isActive ? "Suspend" : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel rbac access-policy">
        <div className="panel-head">
          <div>
            <span>Role policy</span>
            <h3>What each user can open</h3>
          </div>
        </div>
        <div className="rbac-head">
          <span>Role</span>
          <span>Fleet</span>
          <span>Trips</span>
          <span>Safety</span>
          <span>Finance</span>
          <span>Driver</span>
        </div>
        {roles.map((r) => (
          <div className={user.role === r ? "current" : ""} key={r}>
            <b>{roleLabel[r]}</b>
            {["fleet", "trips", "safety", "finance", "driver"].map((area) => (
              <span key={area}>{roleAccess(r, area) ? "✓" : "—"}</span>
            ))}
          </div>
        ))}
      </section>
      {adding && (
        <AddMemberModal
          currentUser={user}
          initialRole={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            load();
          }}
        />
      )}
      {review && (
        <DriverOnboardingReview
          driver={review}
          onClose={() => setReview(null)}
          onSaved={() => {
            setReview(null);
            load();
          }}
        />
      )}
    </>
  );
}
function LegacySettingsPage({ user }: { user: User }) {
  const [members, setMembers] = useState<Member[]>([]),
    [organization, setOrganization] = useState({
      name: user.organizationName,
      operationsEmail: "",
    }),
    [adding, setAdding] = useState(false),
    [message, setMessage] = useState("");
  const load = () =>
    Promise.all([
      api<Member[]>("/users"),
      api<{ name: string; operationsEmail?: string }>("/organization"),
    ]).then(([team, org]) => {
      setMembers(team);
      setOrganization({
        name: org.name,
        operationsEmail: org.operationsEmail || "",
      });
    });
  useEffect(() => {
    load();
  }, []);
  async function saveOrganization(e: FormEvent) {
    e.preventDefault();
    await api("/organization", {
      method: "PUT",
      body: JSON.stringify(organization),
    });
    setMessage("Company profile saved");
    setTimeout(() => setMessage(""), 2500);
  }
  async function updateMember(
    member: Member,
    data: Partial<{ role: Role; isActive: boolean }>,
  ) {
    try {
      await api(`/users/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  const roleAccess = (r: Role, area: string) =>
    ["OWNER", "ADMIN"].includes(r) ||
    (
      {
        fleet: ["FLEET_MANAGER"],
        trips: ["FLEET_MANAGER", "DISPATCHER"],
        safety: ["FLEET_MANAGER", "SAFETY_OFFICER"],
        finance: ["FLEET_MANAGER", "FINANCIAL_ANALYST"],
      } as Record<string, string[]>
    )[area]?.includes(r);
  return (
    <>
      <PageTitle
        eyebrow="Company administration"
        title="People & access"
        description={`Manage ${user.organizationName}, team credentials and server-enforced permissions`}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add team member
          </Button>
        }
      />
      {message && (
        <div className="notice compact">
          <span>
            <Check />
          </span>
          <div>
            <b>{message}</b>
          </div>
        </div>
      )}
      <div className="settings-grid">
        <form className="panel settings-card" onSubmit={saveOrganization}>
          <div className="panel-head">
            <div>
              <span>Workspace</span>
              <h3>Company profile</h3>
            </div>
          </div>
          <Field label="Transport company name">
            <input
              value={organization.name}
              onChange={(e) =>
                setOrganization({ ...organization, name: e.target.value })
              }
              required
            />
          </Field>
          <Field label="Operations email">
            <input
              type="email"
              value={organization.operationsEmail}
              onChange={(e) =>
                setOrganization({
                  ...organization,
                  operationsEmail: e.target.value,
                })
              }
            />
          </Field>
          <div className="owner-note">
            <Building2 />
            <span>
              <b>Tenant-isolated workspace</b>All fleet and financial records
              are scoped to this company.
            </span>
          </div>
          <Button>Save company profile</Button>
        </form>
        <section className="panel rbac">
          <div className="panel-head">
            <div>
              <span>Policy</span>
              <h3>Role permissions</h3>
            </div>
          </div>
          <div className="rbac-head">
            <span>Role</span>
            <span>Fleet</span>
            <span>Trips</span>
            <span>Safety</span>
            <span>Finance</span>
          </div>
          {roles.map((r) => (
            <div className={user.role === r ? "current" : ""} key={r}>
              <b>{roleLabel[r]}</b>
              {["fleet", "trips", "safety", "finance"].map((area) => (
                <span key={area}>{roleAccess(r, area) ? "✓" : "—"}</span>
              ))}
            </div>
          ))}
        </section>
      </div>
      <section className="panel team-panel">
        <div className="panel-head">
          <div>
            <span>Identity & access</span>
            <h3>Company team</h3>
          </div>
          <small>
            {members.filter((m) => m.isActive).length} active · {members.length}{" "}
            total
          </small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team member</th>
                <th>Access role</th>
                <th>Sign-in</th>
                <th>Last active</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="entity">
                      <span className="person">
                        <UserRound />
                      </span>
                      <div>
                        <b>{member.name}</b>
                        <small>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {member.role === "OWNER" ? (
                      <span className="owner-badge">
                        <ShieldCheck /> Company Owner
                      </span>
                    ) : (
                      <select
                        className="role-select"
                        value={member.role}
                        onChange={(e) =>
                          updateMember(member, { role: e.target.value as Role })
                        }
                      >
                        {assignableRoles
                          .filter((r) => user.role === "OWNER" || r !== "ADMIN")
                          .map((r) => (
                            <option value={r} key={r}>
                              {roleLabel[r]}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <span className="auth-method">
                      {member.googleSub
                        ? "Google + password"
                        : "Email & password"}
                    </span>
                  </td>
                  <td>
                    {member.lastLoginAt ? date(member.lastLoginAt) : "Never"}
                  </td>
                  <td>
                    <Status value={member.isActive ? "ACTIVE" : "SUSPENDED"} />
                  </td>
                  <td className="actions">
                    {member.role !== "OWNER" && (
                      <button
                        onClick={() =>
                          updateMember(member, { isActive: !member.isActive })
                        }
                      >
                        {member.isActive ? "Suspend" : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {adding && (
        <AddMemberModal
          currentUser={user}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </>
  );
}
function AddMemberModal({
  currentUser,
  initialRole = "DISPATCHER",
  onClose,
  onSaved,
}: {
  currentUser: User;
  initialRole?: Role;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [role, setRole] = useState<Role>(initialRole);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={role === "DRIVER" ? "Create driver access" : "Create team access"}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={save}>
        {error && (
          <div className="alert">
            <X />
            {error}
          </div>
        )}
        <div className="form-grid">
          <Field label="Full name">
            <input
              name="name"
              placeholder={
                role === "DRIVER" ? "Driver name" : "Team member name"
              }
              required
            />
          </Field>
          <Field label="Work email">
            <input
              name="email"
              type="email"
              placeholder="name@company.com"
              required
            />
          </Field>
          <Field label="Access role">
            <select
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {assignableRoles
                .filter((r) => currentUser.role === "OWNER" || r !== "ADMIN")
                .map((r) => (
                  <option value={r} key={r}>
                    {roleLabel[r]}
                  </option>
                ))}
            </select>
          </Field>
          {role === "DRIVER" && (
            <>
              <Field label="Driver contact number">
                <input
                  name="contact"
                  type="tel"
                  minLength={7}
                  placeholder="+91 98765 43210"
                  required
                />
              </Field>
              <Field label="Driver pay type">
                <select name="payType" defaultValue="PER_TRIP">
                  <option value="PER_TRIP">Per trip</option>
                  <option value="HOURLY">Hourly</option>
                </select>
              </Field>
              <Field label="Driver pay rate (₹)">
                <input
                  name="payRate"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="0"
                  required
                />
              </Field>
            </>
          )}
          <Field label="Temporary password">
            <input
              name="password"
              type="password"
              minLength={10}
              pattern="(?=.*[A-Z])(?=.*[0-9]).{10,}"
              title="Use at least 10 characters, including one uppercase letter and one number"
              placeholder="10+ chars, uppercase & number"
              required
            />
          </Field>
        </div>
        <div className="rule-note">
          <ShieldCheck />
          <span>
            {role === "DRIVER"
              ? "This creates the driver user ID, linked driver profile and payout rule. Trip completion will sync the payout into expenses automatically."
              : "The user can sign in immediately. Their role is stored on the server and cannot be changed from the login screen."}
          </span>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            {role === "DRIVER"
              ? "Create driver access"
              : "Create secure access"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const path = location.pathname;
  const authMode =
    path === "/signup" ? "register" : path === "/login" ? "login" : null;
  const resetMode =
    path === "/forgot-password"
      ? "forgot"
      : path === "/reset-password"
        ? "reset"
        : null;
  const landingPreview = new URLSearchParams(location.search).has("landing");
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(
      !authMode && !resetMode && !landingPreview,
    );
  useEffect(() => {
    const expire = () => {
      clearClientSession();
      setUser(null);
      setChecking(false);
    };
    window.addEventListener("fleetpilot:auth-expired", expire);
    return () => window.removeEventListener("fleetpilot:auth-expired", expire);
  }, []);
  useEffect(() => {
    if (authMode || resetMode || landingPreview) return;
    api<{ user: User }>("/auth/me")
      .then((x) => setUser(x.user))
      .catch(() => {
        clearClientSession();
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, [authMode, resetMode, landingPreview]);
  if (checking) return <Loading />;
  if (authMode) return <AuthPage initialMode={authMode} onLogin={setUser} />;
  if (resetMode) return <PasswordResetPage mode={resetMode} />;
  if (!user || landingPreview) return <Login onLogin={setUser} />;
  return (
    <Shell
      user={user}
      onLogout={() => {
        void api("/auth/logout", { method: "POST" }).finally(() => {
          clearClientSession();
          setUser(null);
        });
      }}
    />
  );
}
