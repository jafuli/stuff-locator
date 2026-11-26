import "server-only";

// The lookup itself lives in src/lib so a browser-side read (Activity's
// "Show earlier activity") can use it too; server code keeps importing it
// from here.
export { fetchDisplayNames } from "@/lib/display-names-query";
