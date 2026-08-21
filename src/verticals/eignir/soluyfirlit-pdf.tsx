// NOTE: no "server-only" marker — the seed script (tsx) and integration tests
// (vitest) import this module outside the Next.js server runtime.
/**
 * Söluyfirlit PDF (SPEC §9), layout modeled on the legacy-system examples
 * (examples/NOTES.md): legal reference header, key-facts panel, Þjóðskrá
 * units row, eigendur, description, áhvílandi lán table, söluþóknun
 * disclosure, agent/agency block, cover photo + floor plan, signature lines.
 *
 * The document is deliberately Icelandic-only — it is a legal Icelandic
 * document, not UI (decision in PROGRESS.md). Rendered with @react-pdf's own
 * reconciler: no app React context (i18n, theme) is available inside.
 */
import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

export interface SoluyfirlitData {
  version: number;
  printedDate: string;
  brandColor: string;
  tenant: { name: string; address: string | null; phone: string | null; email: string | null };
  agent: { name: string; phone: string | null; email: string | null } | null;
  addressLine: string;
  locality: string;
  askingPrice: string;
  facts: Array<{ label: string; value: string }>;
  unitRow: {
    fastanumer: string;
    byggingarar: string;
    birtStaerd: string;
    brunabotamat: string;
    fasteignamat: string;
  } | null;
  owners: Array<{ name: string; kennitala: string | null }>;
  description: string | null;
  loans: Array<{ lender: string; balance: string; terms: string }>;
  soluthoknun: string | null;
  coverJpeg: Buffer | null;
  floorPlanJpeg: Buffer | null;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    paddingTop: 34,
    paddingBottom: 44,
    paddingHorizontal: 40,
    color: "#1a1d23",
  },
  legal: { fontSize: 7, color: "#666", marginBottom: 10 },
  headerBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    paddingBottom: 6,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "bold" },
  subtitle: { fontSize: 10, color: "#555" },
  price: { fontSize: 14, fontWeight: "bold" },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  factsGrid: { flexDirection: "row", flexWrap: "wrap" },
  factCell: { width: "33.33%", marginBottom: 5, paddingRight: 8 },
  factLabel: { fontSize: 7, color: "#777" },
  factValue: { fontSize: 9.5 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    paddingBottom: 2,
    marginBottom: 2,
  },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  th: { fontSize: 7, color: "#777" },
  td: { fontSize: 9 },
  cover: { marginTop: 10, maxHeight: 260, objectFit: "cover", borderRadius: 2 },
  body: { lineHeight: 1.45 },
  signatures: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 36,
  },
  signatureBox: { width: "45%", borderTopWidth: 0.5, borderTopColor: "#333", paddingTop: 3 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#888",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  floorPlanPage: { padding: 40, justifyContent: "center" },
});

function Facts({ facts }: { facts: SoluyfirlitData["facts"] }) {
  return (
    <View style={styles.factsGrid}>
      {facts.map((fact) => (
        <View key={fact.label} style={styles.factCell}>
          <Text style={styles.factLabel}>{fact.label}</Text>
          <Text style={styles.factValue}>{fact.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function SoluyfirlitDocument({ data }: { data: SoluyfirlitData }) {
  const accent = data.brandColor || "#b0703c";
  return (
    <Document
      title={`Söluyfirlit — ${data.addressLine} (v${data.version})`}
      producer="Handsal"
      creator="Handsal"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.legal}>
          Söluyfirlit — eyðublað þetta er samið með vísan til 11. gr. laga nr. 70/2015 um sölu
          fasteigna og skipa. Útgáfa {data.version} — prentað {data.printedDate} úr Handsal.
        </Text>

        <View style={[styles.headerBand, { borderBottomColor: accent }]}>
          <View>
            <Text style={styles.title}>{data.addressLine}</Text>
            <Text style={styles.subtitle}>{data.locality}</Text>
          </View>
          <View>
            <Text style={styles.factLabel}>Ásett verð</Text>
            <Text style={[styles.price, { color: accent }]}>{data.askingPrice}</Text>
          </View>
        </View>

        {data.coverJpeg ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={styles.cover} src={{ data: data.coverJpeg, format: "jpg" }} />
        ) : null}

        <Text style={[styles.sectionTitle, { color: accent }]}>Upplýsingar um eign</Text>
        <Facts facts={data.facts} />

        {data.unitRow ? (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>
              Skráning samkvæmt Þjóðskrá Íslands
            </Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: "20%" }]}>Fastanúmer</Text>
              <Text style={[styles.th, { width: "16%" }]}>Byggingarár</Text>
              <Text style={[styles.th, { width: "16%" }]}>Birt stærð</Text>
              <Text style={[styles.th, { width: "24%", textAlign: "right" }]}>Brunabótamat</Text>
              <Text style={[styles.th, { width: "24%", textAlign: "right" }]}>Fasteignamat</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.td, { width: "20%" }]}>{data.unitRow.fastanumer}</Text>
              <Text style={[styles.td, { width: "16%" }]}>{data.unitRow.byggingarar}</Text>
              <Text style={[styles.td, { width: "16%" }]}>{data.unitRow.birtStaerd}</Text>
              <Text style={[styles.td, { width: "24%", textAlign: "right" }]}>
                {data.unitRow.brunabotamat}
              </Text>
              <Text style={[styles.td, { width: "24%", textAlign: "right" }]}>
                {data.unitRow.fasteignamat}
              </Text>
            </View>
          </View>
        ) : null}

        {data.owners.length > 0 ? (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>Eigendur</Text>
            {data.owners.map((owner, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.td, { width: "55%" }]}>{owner.name}</Text>
                <Text style={[styles.td, { width: "45%" }]}>
                  {owner.kennitala ? `kt. ${owner.kennitala}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.description ? (
          <View>
            <Text style={[styles.sectionTitle, { color: accent }]}>Lýsing</Text>
            <Text style={styles.body}>{data.description}</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: accent }]}>Áhvílandi veðskuldir</Text>
        {data.loans.length === 0 ? (
          <Text style={styles.td}>Engar áhvílandi veðskuldir skráðar.</Text>
        ) : (
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: "40%" }]}>Veðhafi</Text>
              <Text style={[styles.th, { width: "30%", textAlign: "right" }]}>Eftirstöðvar</Text>
              <Text style={[styles.th, { width: "30%", textAlign: "right" }]}>Skilmálar</Text>
            </View>
            {data.loans.map((loan, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.td, { width: "40%" }]}>{loan.lender}</Text>
                <Text style={[styles.td, { width: "30%", textAlign: "right" }]}>{loan.balance}</Text>
                <Text style={[styles.td, { width: "30%", textAlign: "right" }]}>{loan.terms}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: accent }]}>Söluþóknun</Text>
        <Text style={styles.body}>
          {data.soluthoknun ?? "Söluþóknun samkvæmt þjónustusamningi við fasteignasöluna."}
        </Text>

        <Text style={[styles.sectionTitle, { color: accent }]}>Fasteignasala</Text>
        <Text style={styles.td}>
          {[data.tenant.name, data.tenant.address, data.tenant.phone, data.tenant.email]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {data.agent ? (
          <Text style={styles.td}>
            Ábyrgur sölumaður: {[data.agent.name, data.agent.phone, data.agent.email]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.factLabel}>Lesið og móttekið (Kaupandi)</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.factLabel}>Lesið og staðfest (Seljandi)</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.tenant.name}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>

      {data.floorPlanJpeg ? (
        <Page size="A4" style={styles.floorPlanPage}>
          <Text style={[styles.sectionTitle, { color: accent }]}>Grunnmynd</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            style={{ maxHeight: 640, objectFit: "contain" }}
            src={{ data: data.floorPlanJpeg, format: "jpg" }}
          />
        </Page>
      ) : null}
    </Document>
  );
}
