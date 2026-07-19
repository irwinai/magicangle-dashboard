import unittest

from app.service import aggregate_response, extract_orders


class ServiceTests(unittest.TestCase):
    def test_military_list_row_without_play_type_is_an_order(self):
        raw = {
            "data": [
                {
                    "id": "P20260717000001027790",
                    "starterId": "222659",
                    "lotNo": "J00004",
                    "createTime": 1784250308000,
                    "endTime": 1784296740000,
                    "winFlag": 0,
                    "totalNum": 2786,
                }
            ]
        }

        orders = extract_orders(raw)

        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["id"], "P20260717000001027790")
        self.assertEqual(orders[0]["starter_id"], "222659")
        self.assertEqual(orders[0]["lot_no"], "J00004")

    def test_buyer_list_and_summary_are_extracted(self):
        raw = {
            "data": {
                "orderInfo": {"totalNumber": 2793, "totalAmt": 37033200.00},
                "buyerList": [
                    {"nickname": "大表哥稳", "headPic": "https://example.test/a.jpg", "totalAmt": 5000000, "starter": True},
                    {"nickname": "用户2605", "totalAmt": 1000000, "starter": False},
                ],
            }
        }

        response = aggregate_response(raw)

        self.assertEqual(len(response["buyers"]), 2)
        self.assertTrue(response["buyers"][0]["isStarter"])
        self.assertEqual(response["buyerSummary"]["totalNumber"], 2793)


if __name__ == "__main__":
    unittest.main()
