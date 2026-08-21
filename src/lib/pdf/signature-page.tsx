// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Signature page appended to fully signed documents by the signing webhook
 * (SPEC §11 — the mock provider "stamps a signature page"). Vertical-agnostic,
 * hence in lib/pdf rather than a vertical module.
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9.5,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 46,
    color: "#1a1d23",
  },
  title: { fontSize: 17, fontWeight: "bold", marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbb",
    paddingBottom: 2,
  },
  row: { flexDirection: "row", paddingVertical: 1.5 },
  cellWide: { width: "50%" },
  cell: { width: "25%", color: "#666", fontSize: 8.5 },
  body: { lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 46,
    right: 46,
    fontSize: 7,
    color: "#888",
  },
});

export interface SignaturePageData {
  title: string;
  signedDate: string;
  signers: Array<{ name: string; kennitala: string; signedAtFormatted: string }>;
}

export function SignaturePageDocument({ data }: { data: SignaturePageData }) {
  return (
    <Document title={`Undirritunarsíða — ${data.title}`} producer="Handsal" creator="Handsal">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Undirritunarsíða</Text>
        <Text style={styles.subtitle}>{data.title}</Text>
        <Text style={styles.body}>
          Skjalið var undirritað rafrænt {data.signedDate} í gegnum Handsal
          (prófunarumhverfi — mock undirritunarveita).
        </Text>
        <Text style={styles.sectionTitle}>Undirritanir</Text>
        {data.signers.map((signer, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.cellWide}>{signer.name}</Text>
            <Text style={styles.cell}>kt. {signer.kennitala}</Text>
            <Text style={styles.cell}>{signer.signedAtFormatted}</Text>
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>Handsal — rafræn undirritun (mock)</Text>
        </View>
      </Page>
    </Document>
  );
}
