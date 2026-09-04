// Imports every model so the demo kit's schema registry is complete.
//
// The kit compiles all known schemas onto each sandbox connection up front, so
// populate can resolve a `ref` the request never touched directly. "Known"
// means "the module has been imported" — and Next bundles per route, so a route
// that populates Category without importing it would otherwise hit
// MissingSchemaError on a cold sandbox connection.
//
// lib/mongoose.js imports this, so it is loaded before any connection is used.
// Add every new model here.
import "./Category";
import "./CustomUrl";
import "./Discount";
import "./FlashSale";
import "./FraudAccount";
import "./ImageHash";
import "./LandingPage";
import "./NcomEvent";
import "./NcomReservation";
import "./Notification";
import "./Order";
import "./Product";
import "./Settings";
import "./SizeChart";
import "./TrackingConfig";
import "./TrackingEvent";
import "./User";
// Counter lives in lib/, not models/ — it is still a model.
import "../lib/order-number";
