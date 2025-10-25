import React, { useState } from "react";
import Head from "next/head";
// import Image from "next/image"; // Disabled - causes GPU issues on Raspberry Pi
import DeliverySystem from "../components/DeliverySystem";

export default function HomePage() {
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);

  const tables = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];

  const handleTableClick = (tableId: string) => {
    if (selectedTables.includes(tableId)) {
      // Remove table if already selected
      setSelectedTables(selectedTables.filter((id) => id !== tableId));
    } else if (selectedTables.length < 3) {
      // Add table if less than 3 selected
      setSelectedTables([...selectedTables, tableId]);
    }
  };

  const handleDeliver = () => {
    if (selectedTables.length > 0) {
      setShowDelivery(true);
    }
  };

  const handleDeliveryComplete = () => {
    setShowDelivery(false);
    setShowTableSelection(false);
    setSelectedTables([]);
  };

  const handleBackToSelection = () => {
    setShowDelivery(false);
  };

  const handleWelcomeClick = () => {
    setShowTableSelection(true);
  };

  return (
    <React.Fragment>
      <Head>
        <title>MesaMate - Table Management System</title>
        <meta
          name="description"
          content="Professional table management system"
        />
      </Head>

      <div className="welcome-container">
        {showDelivery ? (
          // Delivery System
          <DeliverySystem
            selectedTables={selectedTables}
            onDeliveryComplete={handleDeliveryComplete}
            onBackToSelection={handleBackToSelection}
          />
        ) : !showTableSelection ? (
          // Welcome Screen
          <div
            className="h-screen flex flex-col items-center justify-center px-3 cursor-pointer touch-target"
            onClick={handleWelcomeClick}
          >
            <div className="text-center w-full max-w-sm">
              <div className="mb-4">
                <img
                  className="mx-auto mb-3"
                  src="/images/logo.png"
                  alt="MesaMate Logo"
                  width={80}
                  height={80}
                  style={{ display: "block" }}
                />
              </div>

              <h1 className="compact-heading font-bold text-gray-900 mb-3">
                Welcome to <span style={{ color: "#e41d28" }}>MesaMate</span>
              </h1>

              <p className="compact-text text-gray-600 mb-6 leading-relaxed">
                Professional table management system
              </p>

              <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-100">
                <p className="compact-text text-gray-700 mb-3">
                  Tap to start selecting tables
                </p>
                <div className="flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Table Selection Screen
          <div className="h-screen flex flex-col px-3 py-4">
            {/* Header */}
            <div className="text-center mb-4 flex-shrink-0">
              <h2 className="compact-subheading font-bold text-gray-900 mb-2">
                Select Tables
              </h2>
              <p className="compact-text text-gray-600 mb-2">
                Choose up to 3 tables
              </p>
              <div className="mb-3">
                <span className="compact-text text-gray-500">
                  Selected: {selectedTables.length}/3
                </span>
              </div>
            </div>

            {/* Table Grid */}
            <div className="flex-1 grid grid-cols-4 gap-2 mb-4 overflow-hidden">
              {tables.map((table) => (
                <div
                  key={table}
                  className={`table-card text-center ${
                    selectedTables.includes(table) ? "selected" : ""
                  }`}
                  onClick={() => handleTableClick(table)}
                >
                  <div
                    className="text-xl font-bold mb-1"
                    style={{ color: "#e41d28" }}
                  >
                    {table}
                  </div>
                  <div className="text-xs text-gray-600">Table {table}</div>
                  {selectedTables.includes(table) && (
                    <div className="mt-1">
                      <div className="w-4 h-4 bg-red-500 rounded-full mx-auto flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Selected Tables Summary */}
            {selectedTables.length > 0 && (
              <div className="mb-4 flex-shrink-0">
                <div className="bg-white rounded-lg shadow-lg p-3 border border-gray-100">
                  <h3 className="compact-text font-semibold text-gray-900 mb-2 text-center">
                    Selected Tables
                  </h3>
                  <div className="flex flex-wrap justify-center gap-1">
                    {selectedTables.map((table) => (
                      <span
                        key={table}
                        className="px-2 py-1 text-xs font-medium text-white rounded-full"
                        style={{ backgroundColor: "#e41d28" }}
                      >
                        {table}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 flex-shrink-0">
              <button
                onClick={handleDeliver}
                disabled={selectedTables.length === 0}
                className="btn-primary w-full"
              >
                Deliver to{" "}
                {selectedTables.length > 0
                  ? `${selectedTables.length} table${
                      selectedTables.length > 1 ? "s" : ""
                    }`
                  : "Tables"}
              </button>

              <button
                onClick={() => setShowTableSelection(false)}
                className="btn-secondary w-full"
              >
                Back to Welcome
              </button>
            </div>
          </div>
        )}
      </div>
    </React.Fragment>
  );
}
