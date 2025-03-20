// this function can be used to send a message to chatwork

//const serverURL = "https://kurachi.onrender.com";
const serverURL = "http://localhost:3000";

// Function to retrieve monthly data from inventoryDB
async function getMonthlyInventoryData() {
  const url = `${serverURL}/queries`;

  // Get the current date
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // Months are zero-based in JavaScript

  // Format the start and end dates for the current month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);

  const aggregation = [
    {
      $match: {
        工場: "肥田瀬",
        Date: {
          $gte: new Date(formattedStartDate),
          $lte: new Date(formattedEndDate)
        }
      }
    },
    {
      $group: {
        _id: "$Date",
        items: {
          $push: {
            品番: "$品番",
            quantity: "$Quantity"
          }
        },
        totalQuantity: { $sum: "$Quantity" }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      dbName: "submittedDB",
      collectionName: "inventoryDB",
      aggregation
    })
  });

  if (response.ok) {
    const result = await response.json();
    console.log('Monthly Inventory Data:', result);

    // Calculate the summary
    const summary = result.reduce((acc, curr) => {
      curr.items.forEach(item => {
        if (!acc[item.品番]) {
          acc[item.品番] = 0;
        }
        acc[item.品番] += item.quantity;
      });
      return acc;
    }, {});

    const detailedBreakdown = result.map(day => {
      const date = formatDate(new Date(day._id));
      const items = day.items.map((item, index) => `${index + 1}. ${item.品番}: ${item.quantity}`).join('\n');
      return `日付: ${date}\n${items}`;
    }).join('\n\n');

    const summaryMessage = Object.entries(summary)
      .map(([品番, quantity], index) => `${index + 1}. ${品番}: ${quantity}`)
      .join('\n');

    const message = `今月のデータ： ${formattedStartDate} - ${formattedEndDate}:\n\n${detailedBreakdown}\n\nまとめ：\n${summaryMessage}`;

    // Send the message to Chatwork
    sendMessageToChatwork(message, "390748940");
  } else {
    console.error('Failed to retrieve monthly data:', response.status, await response.text());
  }
}

// Function to send a message to Chatwork
async function sendMessageToChatwork(message, roomId) {
  const response = await fetch(`${serverURL}/inventoryChat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, roomId })
  });

  if (response.ok) {
    const result = await response.json();
    console.log('Message sent successfully:', result);
  } else {
    console.error('Failed to send message:', response.status, await response.text());
  }
}

// Example usage
getMonthlyInventoryData();